'use strict';

function _toArray(arr) { return Array.isArray(arr) ? arr : Array.from(arr); }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

require("babel-polyfill");
var execa = require('execa');

var listCmd = 'aws iam list-policies --scope Local --output json';
var deleteCmd = 'aws iam delete-policy --policy-arn ';
var cleanUp = function () {
	var _ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee() {
		var _listCmd$split, _listCmd$split2, cmd, args, list;

		return regeneratorRuntime.wrap(function _callee$(_context) {
			while (1) {
				switch (_context.prev = _context.next) {
					case 0:
						_listCmd$split = listCmd.split(' ');
						_listCmd$split2 = _toArray(_listCmd$split);
						cmd = _listCmd$split2[0];
						args = _listCmd$split2.slice(1);
						_context.t0 = JSON;
						_context.next = 7;
						return execa(cmd, args);

					case 7:
						_context.t1 = _context.sent.stdout;
						list = _context.t0.parse.call(_context.t0, _context.t1).Policies;


						list = list.filter(function (item) {
							return item.PolicyName.indexOf('prt') === 0;
						});

						list.forEach(function (el) {
							var _split = (deleteCmd + el.Arn).split(' ');

							var _split2 = _toArray(_split);

							cmd = _split2[0];
							args = _split2.slice(1);

							execa(cmd, args);
						});

					case 11:
					case 'end':
						return _context.stop();
				}
			}
		}, _callee, this);
	}));

	function cleanUp() {
		return _ref.apply(this, arguments);
	}

	return cleanUp;
}();

cleanUp();