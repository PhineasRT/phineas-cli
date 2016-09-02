#!/usr/bin/env node

require("babel-polyfill");
const homedir = require('homedir');
const program = require('commander')
const prompt = require('prompt-promise');
const execa = require('execa')
const fetch = require('node-fetch')
const dashify = require('dashify')
const shortid = require('shortid')
const fs = require('fs')
const swig = require('swig')
const ora = require('ora')
const chalk = require('chalk')
const pathExists = require('path-exists');
const config = require('./config')

const PRT_DIR = homedir() + '/.prt';
const PRT_CREDS_FILE = PRT_DIR + '/creds'

const PRT_SERVICE = config.backend.prod
var APP_ID = ''

const command = {
  'mkdir' : 'mkdir -p ' + PRT_DIR,
  'touch' : 'touch ' + PRT_CREDS_FILE
}

const cyan = chalk.cyan.bind(chalk)

var configure = async function configure() {
  var email = await prompt(cyan('email: '))
  var secret = await prompt.password(cyan('secret: '))
  var data = {'account': {email, secret}};

  var reqParams = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  }

  try {
    const spinner = ora('Authenticating...').start();
    var response = await((await fetch(PRT_SERVICE + '/account/auth', reqParams)).json())

    if(!response.ok) {
      spinner.text = 'Authentication Failed'
      spinner.fail()
      return ;
    }

    spinner.text = 'Authentication Successful'
    spinner.succeed()

    await runCmd(command['mkdir'])
    fs.writeFileSync(PRT_CREDS_FILE, JSON.stringify(data))
  } catch (err) {
    console.error(err.message)
  }
}

// run a shell command
function runCmd(command) {
  const [cmd, ...args] = command.split(' ')
  return execa(cmd, args)
}

// create AWS IAM policy
function createPolicy(name, doc) {
  return runCmd(`aws iam create-policy --policy-name ${name} --policy-document file://${doc} --output json`)
}

// setup IAM policies and users
var setupIAM = async function setupIAM(tableArn, kinsesisTableArn, wildcardStreamArn) {
  const spinner = ora('Creating IAM policies').start();

  try {
    const policyTemplate = fs.readFileSync('templates/table-access-policy.swig').toString()
    const policy = fillTemplate(policyTemplate, {tableArn, kinsesisTableArn, wildcardStreamArn})

    // 1. create IAM policies
    await runCmd(`mkdir -p ${PRT_DIR}/policies`)

    // paths to policy docs
    const tablePolicyDoc = `${PRT_DIR}/policies/table-access-policy`
    const cloudwatchPolicyDoc = `${PRT_DIR}/policies/cloudwatch-access-policy` 

    // write policy files to 'policies' directory
    fs.writeFileSync(tablePolicyDoc, policy)
    fs.writeFileSync(cloudwatchPolicyDoc, 
      fs.readFileSync('templates/cloudwatch-allow-putMetricData.swig').toString())

    var [...res] = await Promise.all([
      createPolicy('prt-table-access-' + APP_ID, tablePolicyDoc),
      createPolicy('prt-cloudwatch-allow-putMetricData-' + APP_ID , cloudwatchPolicyDoc)
    ])

    var arns = res.map(function (el) {
      return JSON.parse(el.stdout).Policy.Arn
    })

    spinner.text = `Created ${arns.length} IAM policies`
    spinner.succeed()
    
    // 2. create IAM user
    spinner.text = 'Creating IAM user'
    spinner.start()
    const username = `prt-user-${APP_ID}`
    await runCmd(`aws iam create-user --user-name ${username}`)

    spinner.text = `Created IAM user ${username}`
    spinner.succeed()

    // 3. attach policies to user
    spinner.text = 'Attaching policies to user'
    spinner.start()

    arns.forEach(async function (arn) {
      await runCmd(`aws iam attach-user-policy --user-name ${username} --policy-arn ${arn}`)
    })

    spinner.text = 'Attached policies'
    spinner.succeed()


    // 4. Get credentials
    spinner.text = 'Fetching credentials'
    spinner.start()

    const createCmdOutput = await runCmd(`aws iam create-access-key --user-name ${username} --output json`)
    const creds = JSON.parse(createCmdOutput.stdout).AccessKey

    // console.log(creds.AccessKeyId)
    // console.log(creds.SecretAccessKey)

    spinner.text = 'Fetched credentials'
    spinner.succeed()

    spinner.stop()
    return {'accessKeyId': creds.AccessKeyId, 'secretAccessKey': creds.SecretAccessKey}
  } catch(err) {
    spinner.fail()
    console.log(err.message)
    spinner.stop()
  }
} 

var setupProject = async function setupProject({account, table, details, aws}) {
  const URL = PRT_SERVICE + '/project/setup'

  var data = {
      account,
      project: {
        details, aws, table
      }
  }

  var reqParams = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  }

  // console.log(data)
  const spinner = ora('spinning up servers').start();
  const res = await (await fetch(URL, reqParams)).json()
  if(res.ok) {
    spinner.text = 'Setup done'
    spinner.succeed()
  }
}

var create = async function create (project_name) {
  
  const credsExist = await pathExists(PRT_CREDS_FILE);
  if(!credsExist) {
    console.log('Could not find credentials. Run "prt configure" to configure credentials.')
    return;
  }

  // get details
  const details = {};

  const defaultDescription = 'A phineas project'
  const description = await prompt(cyan(`Description: (${defaultDescription})`))
  details.appID = APP_ID = dashify(project_name) + "-" + shortid.generate().toLowerCase()
  details.description = (description.length)? description : defaultDescription
  details.name = project_name

  // get Table details
  const table = {}
  table.tableName = await prompt(cyan('DynamoDB Table Name: '))
  if(!table.tableName.length) {
    console.error("No table name specified")
    return ;
  }
  
  const tableArn = await prompt(cyan('Table ARN: '))
  // const tableArn = "arn:aws:dynamodb:us-east-1:467623578459:table/Chat"

  const kinsesisTableArn = tableArn + "ChangeProcessor"
  table.streamArn = await prompt(cyan(`DynamoDB Stream ARN for table ${table.tableName}: `))
  const wildcardStreamArn = tableArn + "/stream/*" 

  console.log(`\n == Creating project '${project_name}' ==`)

  var creds = await setupIAM(tableArn, kinsesisTableArn, wildcardStreamArn)
  const aws = {userAccessKey: creds.accessKeyId, userSecretKey: creds.secretAccessKey}

  const account = JSON.parse(fs.readFileSync(PRT_CREDS_FILE)).account
  await setupProject({details, table, aws, account})
  process.exit(0)
}

program
  .command('configure')
  .description('configure credentials')
  .action(configure)

program.command('create <project_name>')
  .description('create a phineas project')
  .action(create)

program.parse(process.argv)

// fill a swig template with params
function fillTemplate (template, params) {
  var tpl = swig.compile(template)
  return tpl(params)
}
