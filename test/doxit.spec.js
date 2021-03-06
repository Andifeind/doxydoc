'use strict';

var path = require('path'),
    dox = require('dox');

var DoxyDoc = require('../doxydoc');

describe.skip('DoxyDoc parser', function() {
    var doxydoc;

    describe('grepDataTypes', function() {
        beforeEach(function() {
            doxydoc = new DoxyDoc();
        
        });

        it('Should grep data types from a string', function() {
            var str = '{number}';
            expect(doxydoc.grepDataTypes(str)).to.eql(['number']);
        });

        it('Should grep multiple data types from a string', function() {
            var str = '{number|string|anyother}';
            expect(doxydoc.grepDataTypes(str)).to.eql(['number', 'string', 'anyother']);
        });

        it('Should return an empty array when input str is undefined or empty', function() {
            var str = '';
            expect(doxydoc.grepDataTypes(str)).to.eql([]);
            str = undefined;
            expect(doxydoc.grepDataTypes(str)).to.eql([]);
        });

        it('Should return an empty array when input str is a boolean', function() {
            expect(doxydoc.grepDataTypes(true)).to.eql([]);
            expect(doxydoc.grepDataTypes(false)).to.eql([]);
            expect(doxydoc.grepDataTypes(null)).to.eql([]);
        });
    });

    describe('tagParser', function() {
        before(function() {

            doxydoc = new DoxyDoc();
        });

        it('Should parse a @module tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test module\n' +
                ' *\n' +
                ' * @module testModule\n' +
                ' */\n' +
                'var str = {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'module',
                name: 'testModule'
            });
        });

        it('Should parse a @group tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test module\n' +
                ' *\n' +
                ' * @group myGroup\n' +
                ' */\n' +
                'var str = {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                group: 'myGroup'
            });
        });

        it('Should parse a @constructor tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test constructor\n' +
                ' *\n' +
                ' * @constructor\n' +
                ' */\n' +
                'var Const = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                isConstructor: true,
                type: 'function',
                name: 'Const',
            });
        });

        it('Should parse a @method tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' *\n' +
                ' * @method myMethod\n' +
                ' */\n' +
                'var Const = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'method',
                name: 'myMethod'
            });
        });

        it('Should parse a @method tag without name section', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' *\n' +
                ' * @method\n' +
                ' */\n' +
                'var myMethod = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'method',
                name: 'myMethod'
            });
        });

        it('Should parse a method without @method tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' */\n' +
                'var myMethod = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'function',
                name: 'myMethod'
            });
        });

        it('Should parse a @property tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test property\n' +
                ' *\n' +
                ' * @property {Boolean} myProp\n' +
                ' */\n' +
                'var Const.prototype.myProp = true;'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'property',
                name: 'myProp',
                dataTypes: ['Boolean']
            });
        });

        it('Should parse a function', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' */\n' +
                'var Const = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'function',
                name: 'Const'
            });
        });

        it('Should parse a constructor function', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' * @constructor\n' +
                ' */\n' +
                'var Const = function() {};'
            );

            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'function',
                name: 'Const',
                isConstructor: true
            });
        });

        it('Should parse a @example tag', function() {
            var doxed = dox.parseComments(
                '/**\n' +
                ' * Test method\n' +
                ' * @constructor\n' +
                ' * @example\n' +
                ' * var const = new Const();\n' +
                ' */\n' +
                'var Const = function() {};'
            );

            doxydoc.moduleDataType = 'js';
            var tags = doxydoc.parseTags(doxed[0]);
            expect(tags).to.eql({
                type: 'function',
                name: 'Const',
                isConstructor: true,
                examples: [{
                    code: 'var const = new Const();',
                    type: 'js'
                }]
            });
        });
    });
});
