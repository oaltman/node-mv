var path = require('path'),
  fs = require('fs'),
  util = require('util'),
  glob = require('glob'),
  async = require('async');

var supportedFileTypes = ['js', 'coffee'];

exports.getFileMatchingStr = function() {
  return '**/*.+(' + supportedFileTypes.join('|') + ')';
}

exports.mvFile = function(currentDir, sourceAbsPath, destAbsPath, cb) {
  fs.exists(sourceAbsPath, function(exists) {
    if (!exists) return cb(new Error('File ' + sourceAbsPath + ' does not exist!'));

    fs.rename(sourceAbsPath, destAbsPath, function(err) {
      if (err) return cb(err);

      async.series([
        function(cb) {exports.updateReferenceInFile(sourceAbsPath, destAbsPath, cb)},
        function(cb) {exports.updateReferenceToMovedFile(currentDir, sourceAbsPath, destAbsPath, cb)}
      ], cb)
    })
  });
};

exports.updateReferenceInFile = function(sourceAbsPath, destAbsPath, cb) {
  fs.readFile(destAbsPath, 'utf8', function(err, data) {
    if (err) return cb(err);

    var re = /require(\(|\s)('|")(\.\S+)('|")(\))?/g;
    var re1 = /require(\(|\s)('|")(\.\S+)('|")(\))?/;
    var matches = data.match(re);

    if (matches) {
      matches.forEach(function(match) {
        var oldRequire = match,
          groups = re1.exec(match),
          oldPath = groups[3],
          oldAsbPath = path.join(path.dirname(sourceAbsPath), oldPath),
          newRelativePath = path.relative(path.dirname(destAbsPath), oldAsbPath);

        if (newRelativePath.indexOf(".") != 0 ) {
          newRelativePath = './' + newRelativePath;
        }

        var newRequire = oldRequire.replace(re1, 'require$1$2' + newRelativePath + '$4$5');
        data = data.replace(oldRequire, newRequire);
      })
    }
    fs.writeFile(destAbsPath, data, {encoding: 'utf8'}, cb);
  });
}

exports.updateReferenceToMovedFile = function(currentDir, sourceAbsPath, destAbsPath, cb) {
  var fileMatchingStr = exports.getFileMatchingStr();
  glob(fileMatchingStr, {cwd:currentDir}, function(err, files) {
    if (err) return cb(err);

    function updateReferenceForFile(file, cb) {
      var oldRelativePath = path.relative(path.dirname(file), sourceAbsPath).replace(/\.(js|coffee)$/, ''),
        newRelativePath = path.relative(path.dirname(file), destAbsPath).replace(/\.(js|coffee)$/, '');
      if (oldRelativePath.indexOf(".") != 0 ) {
        oldRelativePath = './' + oldRelativePath;
      }
      if (newRelativePath.indexOf(".") != 0 ) {
        newRelativePath = './' + newRelativePath;
      }

      var regex = exports.generateRequireRegex(oldRelativePath);
      fs.readFile(file, 'utf8', function(err, data) {
        if (err) return cb(err);

        var result = data.replace(regex, 'require$1$2' + newRelativePath + '$4$5');
        fs.writeFile(file, result, {encoding: 'utf8'}, cb);
      })
    }
    async.eachLimit(files, 20, updateReferenceForFile, cb);
  })
}


exports.generateRequireRegex = function(filePath) {
  return new RegExp("require(\\(|\\s)('|\")(" + filePath + ")('|\")(\\))?", "g");
}
