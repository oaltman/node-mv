const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec
const async = require('async')
const ProgressBar = require('progress')
const walk = require('./lib/walk')
var defaultRegExcludes = [/^\.+.*/, /node_modules/];
var bar = null;

function main(currentDir, originalPath, newPath, options, cb) {
	fs.exists(originalPath, function(exists){
		if (!exists) return cb(new Error(originalPath + ' does not exist!'));

		fs.stat(originalPath, function (err, stat) {
			if (err) return cb(err);

			if (stat.isDirectory()) {
				mvDir(currentDir, originalPath, newPath, options, cb)
			} else {
				mvFile(currentDir, originalPath, newPath, options, cb)
			}
		});
	})
};

function mvFile(currentDir, originalFilePath, newFilePath, options, cb) {
	fs.exists(newFilePath, function(exists) {
		const steps = [function(cb) {
			rename(originalFilePath, newFilePath, options.git, cb)
		}];
		const excludes = getExcludes(options);
		steps.push(function(cb) {updateReferencesInMovedFile(originalFilePath, newFilePath, null, cb)});
		steps.push(function(cb) {updateReferencesToMovedFile(currentDir, originalFilePath, newFilePath, excludes, cb)});

		async.series(steps, cb);
	})
}

function getExcludes(options) {
	var excludes = defaultRegExcludes, steps = [];
	if (options.excludes) {
		excludes = excludes.concat(options.excludes);
	}
	return excludes;
}

function mvDir(currentDir, originalDirPath, newDirPath, options, cb) {
	originalDirPath = originalDirPath.replace(/\/$/, '');

	console.log('newDirPath', newDirPath);
	if (newDirPath[newDirPath.length - 1] === '/') {
		var pathParts = originalDirPath.split(path.sep);
		newDirPath = newDirPath + pathParts[pathParts.length - 1];
	}

	fs.exists(newDirPath, function(exists) {
		if (exists) return cb(new Error(newDirPath + ' is already exist!'));

		walk(originalDirPath, [], function(err, files) {
			if (err) return cb(err);

			bar = new ProgressBar('  processing [:bar] :percent :etas', {total: files.length});

			rename(originalDirPath, newDirPath, options.git, function(err) {
				if (err) return cb(err);

				async.eachSeries(files, function(file, cb) {
					bar.tick();
					var newFilePath = file.replace(originalDirPath, newDirPath);

					const steps = [];
					steps.push(function(cb) {
						var excludeRequires = '^' + originalDirPath;
						updateReferencesInMovedFile(file, newFilePath, new RegExp(excludeRequires), cb)
					});
					const searchExcludes = getExcludes(options);
					steps.push(function(cb) {
						updateReferencesToMovedFile(currentDir, file, newFilePath, searchExcludes, cb)
					});

					async.parallel(steps, cb);

				}, cb)
			})
		})
	});
}

function rename(originalPath, newPath, supportGit, cb) {
	if (supportGit) {
		exec('git mv ' + originalPath + ' ' + newPath, function(err, stdout, stderr) {
			if (err) return cb(err);
			if (stderr) return cb(stderr);
			cb();
		})
	} else {
		fs.rename(originalPath, newPath, cb);
	}
}

function updateReferencesInMovedFile(originalFilePath, newFilePath, excludes, cb) {
	fs.readFile(newFilePath, 'utf8', function(err, data) {
		if (err) return cb(err);

		var requires = getRequires(data);

		if (requires) {
			requires.forEach(function(oldRequire) {
				var newRequire = generateNewRequire(oldRequire, originalFilePath, newFilePath, excludes);
				if (newRequire)
					data = data.replace(oldRequire, newRequire);
			})
		}
		fs.writeFile(newFilePath, data, {encoding: 'utf8'}, cb);
	});
}

function getRequires(fileData) {
	var re = /require(\(|\s)('|")(\.\S+)('|")(\))?/g;
	return fileData.match(re);
}

function generateNewRequire(oldRequire, originalFilePath, newFilePath, excludes) {
	var re = /require(\(|\s)('|")(\.\S+)('|")(\))?/,
		groups = re.exec(oldRequire),
		oldPath = groups[3],
		oldAsbPath = path.join(path.dirname(originalFilePath), oldPath);
		if (excludes && excludes.test(oldAsbPath)) return null;
		let newRelativePath = path.relative(path.dirname(newFilePath), oldAsbPath);

	if (newRelativePath.indexOf('.') != 0 ) {
		newRelativePath = './' + newRelativePath;
	}

	return oldRequire.replace(re, 'require$1$2' + newRelativePath + '$4$5');
}

function updateReferencesToMovedFile(currentDir, originalFilePath, newFilePath, regExcludes, cb) {
	walk(currentDir, regExcludes, function(err, files) {
		if (err) return cb(err);

		function updateReferenceForFile(file, cb) {
			var oldRelativePath = path.relative(path.dirname(file), originalFilePath).replace(/\.(js|coffee)$/, ''),
				newRelativePath = path.relative(path.dirname(file), newFilePath).replace(/\.(js|coffee)$/, '');
			if (oldRelativePath.indexOf(".") != 0 ) {
				oldRelativePath = './' + oldRelativePath;
			}
			if (newRelativePath.indexOf(".") != 0 ) {
				newRelativePath = './' + newRelativePath;
			}

			var regex = generateRequireRegex(oldRelativePath);
			fs.readFile(file, 'utf8', function(err, data) {
				if (err) return cb(err);

				if (data.indexOf(regex.toString())) {
					var result = data.replace(regex, 'require$1$2' + newRelativePath + '$4$5');
					return fs.writeFile(file, result, {encoding: 'utf8'}, cb);
				} else {
					return cb()
				}
			})
		}
		async.eachSeries(files, updateReferenceForFile, cb);
	})
}

function generateRequireRegex(filePath) {
	return new RegExp("require(\\(|\\s)('|\")(" + filePath + ")('|\")(\\))?", "g");
}

// module.exports = main
module.exports = main
