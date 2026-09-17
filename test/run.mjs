/*
 * Runs every test file in a single process.
 *
 * `node --test test/` spawns one child process per file, which some sandboxed
 * environments block (spawn EPERM); importing the files keeps everything
 * in-process and works everywhere.
 *
 * Usage: npm test
 */

import './util.test.mjs';
import './providers.test.mjs';
import './translate.test.mjs';
import './annotations.test.mjs';
