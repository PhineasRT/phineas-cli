require("babel-polyfill");
const execa = require('execa')

var listCmd = 'aws iam list-policies --scope Local --output json' 
var deleteCmd = 'aws iam delete-policy --policy-arn ';
var cleanUp = async function cleanUp() {
	var [cmd, ...args] = listCmd.split(' ')

	var list = JSON.parse((await execa(cmd, args)).stdout).Policies

	list = list.filter(item => item.PolicyName.indexOf('prt') === 0)

	list.forEach(function (el) {
		[cmd, ...args] = (deleteCmd + el.Arn).split(' ')
		execa(cmd , args)
	})
}

cleanUp()