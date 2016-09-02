#!/usr/bin/env node
'use strict';

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

require("babel-polyfill");
var homedir = require('homedir');
var program = require('commander');
var prompt = require('prompt-promise');
var execa = require('execa');
var fetch = require('node-fetch');
var dashify = require('dashify');
var shortid = require('shortid');
var fs = require('fs');
var swig = require('swig');
var ora = require('ora');
var chalk = require('chalk');
var pathExists = require('path-exists');
var config = require('./config');

var PRT_DIR = homedir() + '/.prt';
var PRT_CREDS_FILE = PRT_DIR + '/creds';

var PRT_SERVICE = config.backend.prod;
var APP_ID = '';

var command = {
  'mkdir': 'mkdir -p ' + PRT_DIR,
  'touch': 'touch ' + PRT_CREDS_FILE
};

var cyan = chalk.cyan.bind(chalk);

var configure = function () {
  var _ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee() {
    var email, secret, data, reqParams, spinner, response;
    return regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return prompt(cyan('email: '));

          case 2:
            email = _context.sent;
            _context.next = 5;
            return prompt.password(cyan('secret: '));

          case 5:
            secret = _context.sent;
            data = { 'account': { email: email, secret: secret } };
            reqParams = {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            };
            _context.prev = 8;
            spinner = ora('Authenticating...').start();
            _context.next = 12;
            return fetch(PRT_SERVICE + '/account/auth', reqParams);

          case 12:
            _context.next = 14;
            return _context.sent.json();

          case 14:
            response = _context.sent;

            if (response.ok) {
              _context.next = 19;
              break;
            }

            spinner.text = 'Authentication Failed';
            spinner.fail();
            return _context.abrupt('return');

          case 19:

            spinner.text = 'Authentication Successful';
            spinner.succeed();

            _context.next = 23;
            return runCmd(command['mkdir']);

          case 23:
            fs.writeFileSync(PRT_CREDS_FILE, JSON.stringify(data));
            _context.next = 29;
            break;

          case 26:
            _context.prev = 26;
            _context.t0 = _context['catch'](8);

            console.error(_context.t0.message);

          case 29:
          case 'end':
            return _context.stop();
        }
      }
    }, _callee, this, [[8, 26]]);
  }));

  function configure() {
    return _ref.apply(this, arguments);
  }

  return configure;
}();

// run a shell command
function runCmd(command) {
  var _command$split = command.split(' ');

  var _command$split2 = _toArray(_command$split);

  var cmd = _command$split2[0];

  var args = _command$split2.slice(1);

  return execa(cmd, args);
}

// create AWS IAM policy
function createPolicy(name, doc) {
  return runCmd('aws iam create-policy --policy-name ' + name + ' --policy-document file://' + doc + ' --output json');
}

// setup IAM policies and users
var setupIAM = function () {
  var _ref2 = _asyncToGenerator(regeneratorRuntime.mark(function _callee4(tableArn, kinsesisTableArn, wildcardStreamArn) {
    var _this = this;

    var spinner, res, arns, _ret;

    return regeneratorRuntime.wrap(function _callee4$(_context4) {
      while (1) {
        switch (_context4.prev = _context4.next) {
          case 0:
            spinner = ora('Creating IAM policies').start();
            _context4.prev = 1;
            return _context4.delegateYield(regeneratorRuntime.mark(function _callee3() {
              var policyTemplate, policy, tablePolicyDoc, cloudwatchPolicyDoc, _ref3, _ref4, username, createCmdOutput, creds;

              return regeneratorRuntime.wrap(function _callee3$(_context3) {
                while (1) {
                  switch (_context3.prev = _context3.next) {
                    case 0:
                      policyTemplate = fs.readFileSync('templates/table-access-policy.swig').toString();
                      policy = fillTemplate(policyTemplate, { tableArn: tableArn, kinsesisTableArn: kinsesisTableArn, wildcardStreamArn: wildcardStreamArn });

                      // 1. create IAM policies

                      _context3.next = 4;
                      return runCmd('mkdir -p ' + PRT_DIR + '/policies');

                    case 4:

                      // paths to policy docs
                      tablePolicyDoc = PRT_DIR + '/policies/table-access-policy';
                      cloudwatchPolicyDoc = PRT_DIR + '/policies/cloudwatch-access-policy';

                      // write policy files to 'policies' directory

                      fs.writeFileSync(tablePolicyDoc, policy);
                      fs.writeFileSync(cloudwatchPolicyDoc, fs.readFileSync('templates/cloudwatch-allow-putMetricData.swig').toString());

                      _context3.next = 10;
                      return Promise.all([createPolicy('prt-table-access-' + APP_ID, tablePolicyDoc), createPolicy('prt-cloudwatch-allow-putMetricData-' + APP_ID, cloudwatchPolicyDoc)]);

                    case 10:
                      _ref3 = _context3.sent;
                      _ref4 = _toArray(_ref3);
                      res = _ref4;
                      arns = res.map(function (el) {
                        return JSON.parse(el.stdout).Policy.Arn;
                      });


                      spinner.text = 'Created ' + arns.length + ' IAM policies';
                      spinner.succeed();

                      // 2. create IAM user
                      spinner.text = 'Creating IAM user';
                      spinner.start();
                      username = 'prt-user-' + APP_ID;
                      _context3.next = 21;
                      return runCmd('aws iam create-user --user-name ' + username);

                    case 21:

                      spinner.text = 'Created IAM user ' + username;
                      spinner.succeed();

                      // 3. attach policies to user
                      spinner.text = 'Attaching policies to user';
                      spinner.start();

                      arns.forEach(function () {
                        var _ref5 = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(arn) {
                          return regeneratorRuntime.wrap(function _callee2$(_context2) {
                            while (1) {
                              switch (_context2.prev = _context2.next) {
                                case 0:
                                  _context2.next = 2;
                                  return runCmd('aws iam attach-user-policy --user-name ' + username + ' --policy-arn ' + arn);

                                case 2:
                                case 'end':
                                  return _context2.stop();
                              }
                            }
                          }, _callee2, this);
                        }));

                        return function (_x4) {
                          return _ref5.apply(this, arguments);
                        };
                      }());

                      spinner.text = 'Attached policies';
                      spinner.succeed();

                      // 4. Get credentials
                      spinner.text = 'Fetching credentials';
                      spinner.start();

                      _context3.next = 32;
                      return runCmd('aws iam create-access-key --user-name ' + username + ' --output json');

                    case 32:
                      createCmdOutput = _context3.sent;
                      creds = JSON.parse(createCmdOutput.stdout).AccessKey;

                      // console.log(creds.AccessKeyId)
                      // console.log(creds.SecretAccessKey)

                      spinner.text = 'Fetched credentials';
                      spinner.succeed();

                      spinner.stop();
                      return _context3.abrupt('return', {
                        v: { 'accessKeyId': creds.AccessKeyId, 'secretAccessKey': creds.SecretAccessKey }
                      });

                    case 38:
                    case 'end':
                      return _context3.stop();
                  }
                }
              }, _callee3, _this);
            })(), 't0', 3);

          case 3:
            _ret = _context4.t0;

            if (!((typeof _ret === 'undefined' ? 'undefined' : _typeof(_ret)) === "object")) {
              _context4.next = 6;
              break;
            }

            return _context4.abrupt('return', _ret.v);

          case 6:
            _context4.next = 13;
            break;

          case 8:
            _context4.prev = 8;
            _context4.t1 = _context4['catch'](1);

            spinner.fail();
            console.log(_context4.t1.message);
            spinner.stop();

          case 13:
          case 'end':
            return _context4.stop();
        }
      }
    }, _callee4, this, [[1, 8]]);
  }));

  function setupIAM(_x, _x2, _x3) {
    return _ref2.apply(this, arguments);
  }

  return setupIAM;
}();

var setupProject = function () {
  var _ref6 = _asyncToGenerator(regeneratorRuntime.mark(function _callee5(_ref7) {
    var account = _ref7.account;
    var table = _ref7.table;
    var details = _ref7.details;
    var aws = _ref7.aws;
    var URL, data, reqParams, spinner, res;
    return regeneratorRuntime.wrap(function _callee5$(_context5) {
      while (1) {
        switch (_context5.prev = _context5.next) {
          case 0:
            URL = PRT_SERVICE + '/project/setup';
            data = {
              account: account,
              project: {
                details: details, aws: aws, table: table
              }
            };
            reqParams = {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
            };

            // console.log(data)

            spinner = ora('spinning up servers').start();
            _context5.next = 6;
            return fetch(URL, reqParams);

          case 6:
            _context5.next = 8;
            return _context5.sent.json();

          case 8:
            res = _context5.sent;

            if (res.ok) {
              spinner.text = 'Setup done';
              spinner.succeed();
            }

          case 10:
          case 'end':
            return _context5.stop();
        }
      }
    }, _callee5, this);
  }));

  function setupProject(_x5) {
    return _ref6.apply(this, arguments);
  }

  return setupProject;
}();

var create = function () {
  var _ref8 = _asyncToGenerator(regeneratorRuntime.mark(function _callee6(project_name) {
    var credsExist, details, defaultDescription, description, table, tableArn, kinsesisTableArn, wildcardStreamArn, creds, aws, account;
    return regeneratorRuntime.wrap(function _callee6$(_context6) {
      while (1) {
        switch (_context6.prev = _context6.next) {
          case 0:
            _context6.next = 2;
            return pathExists(PRT_CREDS_FILE);

          case 2:
            credsExist = _context6.sent;

            if (credsExist) {
              _context6.next = 6;
              break;
            }

            console.log('Could not find credentials. Run "prt configure" to configure credentials.');
            return _context6.abrupt('return');

          case 6:

            // get details
            details = {};
            defaultDescription = 'A phineas project';
            _context6.next = 10;
            return prompt(cyan('Description: (' + defaultDescription + ')'));

          case 10:
            description = _context6.sent;

            details.appID = APP_ID = dashify(project_name) + "-" + shortid.generate().toLowerCase();
            details.description = description.length ? description : defaultDescription;
            details.name = project_name;

            // get Table details
            table = {};
            _context6.next = 17;
            return prompt(cyan('DynamoDB Table Name: '));

          case 17:
            table.tableName = _context6.sent;

            if (table.tableName.length) {
              _context6.next = 21;
              break;
            }

            console.error("No table name specified");
            return _context6.abrupt('return');

          case 21:
            _context6.next = 23;
            return prompt(cyan('Table ARN: '));

          case 23:
            tableArn = _context6.sent;

            // const tableArn = "arn:aws:dynamodb:us-east-1:467623578459:table/Chat"

            kinsesisTableArn = tableArn + "ChangeProcessor";
            _context6.next = 27;
            return prompt(cyan('DynamoDB Stream ARN for table ' + table.tableName + ': '));

          case 27:
            table.streamArn = _context6.sent;
            wildcardStreamArn = tableArn + "/stream/*";


            console.log('\n == Creating project \'' + project_name + '\' ==');

            _context6.next = 32;
            return setupIAM(tableArn, kinsesisTableArn, wildcardStreamArn);

          case 32:
            creds = _context6.sent;
            aws = { userAccessKey: creds.accessKeyId, userSecretKey: creds.secretAccessKey };
            account = JSON.parse(fs.readFileSync(PRT_CREDS_FILE)).account;
            _context6.next = 37;
            return setupProject({ details: details, table: table, aws: aws, account: account });

          case 37:
            process.exit(0);

          case 38:
          case 'end':
            return _context6.stop();
        }
      }
    }, _callee6, this);
  }));

  function create(_x6) {
    return _ref8.apply(this, arguments);
  }

  return create;
}();

program.command('configure').description('configure credentials').action(configure);

program.command('create <project_name>').description('create a phineas project').action(create);

program.parse(process.argv);

// fill a swig template with params
function fillTemplate(template, params) {
  var tpl = swig.compile(template);
  return tpl(params);
}