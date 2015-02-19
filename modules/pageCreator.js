'use strict';

var fs = require('fs'),
    path = require('path');

var markdown = require('markdown').markdown,
    extend = require('node.extend'),
    grunt = require('grunt');

var DoxyDocParser = require('./doxydocParser'),
    firetpl = require('firetpl');

var PageCreator = function(conf) {
    this.conf = {
        indexPage: 'README.md',
        templateDir: conf.templateDir || path.join(__dirname, '../templates/lagoon/'),
        output: conf.output || 'docs'
    };

    this.rootDir = process.cwd();
    this.outDir = path.resolve(process.cwd(), this.conf.output);
    this.locals = this.getMetaInfos();
};

PageCreator.prototype.log = function() {
    if (this.verbose) {
        var args = Array.prototype.slice.call(arguments);
        grunt.log.ok.apply(grunt.log, args);
    }
};

PageCreator.prototype.createPages = function() {
    if (fs.existsSync(path.join(process.cwd(), 'doxydoc.json'))) {
        extend(this.conf, require(path.join(process.cwd(), 'doxydoc.json')));
    }

    if (this.conf.indexPage) {
        this.createPage(this.conf.indexPage, 'index.html', 'index.fire');
    }

    //Parse navigation links
    this.conf.navigationLinks.forEach(function(link) {
        if (link.file) {
            this.createPage(link.file, link.link);
        }
    }, this);


    //Create documentation
    var docu = this.createDocu('html', this.files),
        docuPath = path.join(this.outDir, 'docu.html');
    
    var outDir = this.outDir;
    var copyAssets = function(abspath, rootdir, subdir, file) {
        var src, dest;

        if (arguments.length === 2) {
            src = abspath;
            dest = rootdir;
        }
        else {
            if (!subdir || !/^js|lib\//.test(subdir)) {
                return;
            }

            src = abspath;
            dest = path.join(outDir, subdir, file);
        }

        grunt.log.ok(' ... copy', src.replace(path.join(__dirname, '..') + '/', ''));
        grunt.file.copy(src, dest);
    };

    this.log('Copy docu to:', this.outDir);
    grunt.file.write(docuPath, docu);
    copyAssets(path.join(this.conf.templateDir, 'main.css'), path.join(outDir, 'main.css'));
    grunt.file.recurse(this.conf.templateDir, copyAssets);
    this.log('Finish!');
};

PageCreator.prototype.createPage = function(src, name, template) {
    var ext = path.extname(src);
    if (this.verbose) {
        this.log('Create page "%s" from source: %s', name, src);
    }
    
    template = template || 'page.fire';

    var source;
    if (ext === '.md') {
        source = this.parseMarkdown(fs.readFileSync(src, { encoding: 'utf8' }));
    }
    else if (ext === '.fire') {
        source = this.parseFireTPL(fs.readFileSync(src, { encoding: 'utf8' }));
    }
    else {
        source = fs.readFileSync(src, { encoding: 'utf8' });
    }
    
    var ftl = grunt.file.read(path.join(this.conf.templateDir, template));
    var html = firetpl.fire2html(ftl, extend({
            content: source
        }, this.locals), {
        partialsPath: path.join(this.conf.templateDir, 'partials')
    });

    grunt.file.write(path.join(this.outDir, name), html);
};

PageCreator.prototype.parseMarkdown = function(source) {
    return markdown.toHTML(source);
};

PageCreator.prototype.parseFireTPL = function(source) {
    return firetpl.fire2html(source, this.locals, {
        partialsPath: path.join(this.conf.templateDir, 'partials')
    });
};

PageCreator.prototype.createDocu = function(type, files) {
    
    var doxydoc = new DoxyDocParser();
    doxydoc.templateFile = path.join(this.conf.templateDir, 'docu.fire');
    doxydoc.templateDir = this.conf.templateDir;
    return doxydoc.parse(type, files);
};

PageCreator.prototype.getMetaInfos = function() {
    var files = ['doxydoc.json', 'package.json'],
        dir,
        meta = {},
        file;

    for (var i = 0, len = files.length; i < len; i++) {
        dir = process.cwd();
        while(dir !== '/') {
            file = path.join(dir, files[i]);
            if (fs.existsSync(file)) {
                if (files[i] === 'doxydoc.json') {
                    meta = require(file);
                }
                else {
                    var pkg = require(file);
                    meta.name = meta.name || pkg.name;
                    meta.version = meta.version || pkg.version;
                    meta.description = meta.description || pkg.description;
                }
            }

            dir = path.join(dir, '..');
        }
    }

    return meta;
};

module.exports = PageCreator;