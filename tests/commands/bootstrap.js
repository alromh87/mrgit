/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* jshint mocha:true */

'use strict';

const fs = require( 'fs' );
const path = require( 'upath' );
const sinon = require( 'sinon' );
const mockery = require( 'mockery' );
const expect = require( 'chai' ).expect;

describe( 'commands/bootstrap', () => {
	let bootstrapCommand, stubs, commandData;

	beforeEach( () => {
		mockery.enable( {
			useCleanCache: true,
			warnOnReplace: false,
			warnOnUnregistered: false
		} );

		stubs = {
			shell: sinon.stub(),
			fs: {
				existsSync: sinon.stub( fs, 'existsSync' )
			},
			path: {
				join: sinon.stub( path, 'join' ).callsFake( ( ...chunks ) => chunks.join( '/' ) )
			}
		};

		commandData = {
			arguments: [],
			packageName: 'test-package',
			mgitOptions: {
				cwd: __dirname,
				packages: 'packages'
			},
			repository: {
				directory: 'test-package',
				url: 'git@github.com/organization/test-package.git',
				branch: 'master'
			}
		};

		mockery.registerMock( '../utils/shell', stubs.shell );

		bootstrapCommand = require( '../../lib/commands/bootstrap' );
	} );

	afterEach( () => {
		sinon.restore();
		mockery.deregisterAll();
		mockery.disable();
	} );

	describe( '#helpMessage', () => {
		it( 'defines help screen', () => {
			expect( bootstrapCommand.helpMessage ).is.a( 'string' );
		} );
	} );

	describe( 'beforeExecute()', () => {
		it( 'informs about starting the process', () => {
			const consoleLog = sinon.stub( console, 'log' );

			bootstrapCommand.beforeExecute();

			expect( consoleLog.calledOnce ).to.equal( true );
			expect( consoleLog.firstCall.args[ 0 ] ).to.match( /Cloning missing packages\.\.\./ );

			consoleLog.restore();
		} );
	} );

	describe( 'execute()', () => {
		it( 'rejects promise if something went wrong', () => {
			const error = new Error( 'Unexpected error.' );

			stubs.fs.existsSync.returns( false );
			stubs.shell.returns( Promise.reject( error ) );

			return bootstrapCommand.execute( commandData )
				.then(
					() => {
						throw new Error( 'Supposed to be rejected.' );
					},
					response => {
						expect( response.logs.error[ 0 ].split( '\n' )[ 0 ] ).to.equal( `Error: ${ error.message }` );
					}
				);
		} );

		it( 'clones a repository if is not available', () => {
			stubs.fs.existsSync.returns( false );
			stubs.shell.returns( Promise.resolve( 'Git clone log.' ) );

			return bootstrapCommand.execute( commandData )
				.then( response => {
					expect( stubs.shell.calledOnce ).to.equal( true );

					const cloneCommand = stubs.shell.firstCall.args[ 0 ].split( ' && ' );

					// Clone the repository.
					expect( cloneCommand[ 0 ] )
						.to.equal( 'git clone --progress "git@github.com/organization/test-package.git" "packages/test-package"' );
					// Change the directory to cloned package.
					expect( cloneCommand[ 1 ] ).to.equal( 'cd "packages/test-package"' );
					// And check out to proper branch.
					expect( cloneCommand[ 2 ] ).to.equal( 'git checkout --quiet master' );

					expect( response.logs.info[ 0 ] ).to.equal( 'Git clone log.' );
				} );
		} );

		it( 'does not clone a repository if is available', () => {
			stubs.fs.existsSync.returns( true );

			return bootstrapCommand.execute( commandData )
				.then( response => {
					expect( stubs.shell.called ).to.equal( false );

					expect( response.logs.info[ 0 ] ).to.equal( 'Package "test-package" is already cloned.' );
				} );
		} );

		it( 'installs dependencies of cloned package', () => {
			commandData.arguments.push( '--recursive' );
			commandData.mgitOptions.packages = __dirname + '/../fixtures';
			commandData.repository.directory = 'project-a';

			stubs.fs.existsSync.returns( true );

			return bootstrapCommand.execute( commandData )
				.then( response => {
					expect( response.packages ).is.an( 'array' );
					expect( response.packages ).to.deep.equal( [ 'test-foo' ] );
				} );
		} );

		it( 'installs devDependencies of cloned package', () => {
			commandData.arguments.push( '--recursive' );
			commandData.mgitOptions.packages = __dirname + '/../fixtures';
			commandData.repository.directory = 'project-with-options-in-mgitjson';

			stubs.fs.existsSync.returns( true );

			return bootstrapCommand.execute( commandData )
				.then( response => {
					expect( response.packages ).is.an( 'array' );
					expect( response.packages ).to.deep.equal( [ 'test-bar' ] );
				} );
		} );
	} );

	describe( 'afterExecute()', () => {
		it( 'informs about number of processed packages', () => {
			const consoleLog = sinon.stub( console, 'log' );

			const processedPackages = new Set();
			processedPackages.add( 'package-1' );
			processedPackages.add( 'package-2' );

			bootstrapCommand.afterExecute( processedPackages );

			expect( consoleLog.calledOnce ).to.equal( true );
			expect( consoleLog.firstCall.args[ 0 ] ).to.match( /2 packages have been processed\./ );

			consoleLog.restore();
		} );
	} );
} );
