#!/usr/bin/env node
// @ts-check
const path = require('path')
const program = require('commander')
const mv = require('../index.js')

function regexList(val) {
	return val
		.split(',')
		.map(x => new RegExp(x, "g"))
}

program
	.version('0.0.1')
	.option('-g, --git', 'Rename in git')
	.option('-e, --excludes <items>', 'List of regex for dir/files to excludes', regexList)
	.parse(process.argv);

if (process.argv.length < 4) {
	console.log(program.help());
}

const source = process.argv[2]
const dest = process.argv[3]
const currentDir = process.cwd()
const	originalPath = path.join(currentDir, source)
const	destAbsPath = path.join(currentDir, dest)

mv(currentDir, originalPath, destAbsPath, program, function(err) {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	process.exit();
})
