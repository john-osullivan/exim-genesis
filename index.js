#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
var uniq = require('lodash.uniq');
const utils = require('ethereumjs-util');
let template = require('./template.json');

const CONFIG_FILENAME = 'sample-config.json';
const OUTPUT = 'quorum-genesis.json';

const VOTING_CONTRACT_ADDR = '0x0000000000000000000000000000000000000020';
const GOVERNANCE_CONTRACT_ADDR = '0x000000000000000000000000000000000000002a';

/**
 * Given an index (non-negative integer), return it as a
 * hex string left-padded to 32 chars. Pass prefix boolean
 * as `true` to get an '0x' prefix.
 * @param {number} index 
 * @param {boolean} prefix 
 */
function padIndex(index, prefix) {
  if(prefix) {
    return utils.addHexPrefix(utils.setLengthLeft([index], 32, false).toString('hex'));
  }
  return utils.setLengthLeft([index], 32, false).toString('hex');
}

/**
 * Given an Ethereum address (40 characters after removing '0x'),
 * left-pad with '0's to get a 64-char un-prefixed hex string.
 * @param {string} address 
 */
function padAddress(address) {
  return "000000000000000000000000" + utils.stripHexPrefix(address);
}

/**
 * Given a Mapping variable's index and a key to store, return
 * an '0x'-prefixed hex string for use in the "storage" object
 * @param {number} index 
 * @param {string} address 
 */
function mapKey(index, address) {
  let paddedAddress = padAddress(address);
  let paddedIndex = padIndex(index);
  let result = utils.sha3(new Buffer(paddedAddress+paddedIndex, 'hex')).toString('hex');
  return utils.addHexPrefix(result)
}

/**
 * Given a variable index, an array of addresses, and a contract's
 * address (e.g. '0x0...02A'), add all of the key-value pairs so
 * each address has a `true` value.  Globally modifies the `template` object.
 * @param {number} index 
 * @param {string[]} addresses 
 * @param {string} storageAddress 
 */
function mapAddresses(index, addresses, storageAddress) {
  let value = utils.intToHex(1);
  for(let i=0; i<addresses.length; i++) {
    let key = mapKey(index, addresses[i]);
    template['alloc'][storageAddress].storage[key] = value;
  }
}

/**
 * Set initial values for `voteThreshold`, `voterCount`, `canVote`,
 * `blockMakerCount`, and `canCreateBlocks` in the 
 * `BlockVotingDeployable.sol` contract.
 * @param {*} config 
 */
function buildVotingStorage(config) {
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(1,true)] = utils.intToHex(config.threshold);
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(2,true)] = utils.intToHex(config.voters.length);
  mapAddresses(3, config.voters, VOTING_CONTRACT_ADDR);
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(4,true)] = utils.intToHex(config.makers.length);
  mapAddresses(5,config.makers, VOTING_CONTRACT_ADDR);
}

/**
 * Set initial values for `owners` and `numOwners` in the
 * `WeylGovDeployable.sol` contract.
 * @param {*} config 
 */
function buildGovernanceStorage(config){
  mapAddresses(0, config.owners, GOVERNANCE_CONTRACT_ADDR);
  template['alloc'][GOVERNANCE_CONTRACT_ADDR].storage[padIndex(1,true)] = utils.intToHex(config.owners.length);
}

/**
 * Provide an initial value of `"1000000000000000000000000000"` gas
 * for both governance contracts and all of the addresses included
 * in the config file.
 * @param {*} config 
 */
function fundAddresses(config) {
  let all = uniq(config.makers
    .concat(config.voters)
    .concat(config.fundedObservers)
    .concat(config.owners));
  for(let i=0; i<all.length; i++) {
    template['alloc'][utils.addHexPrefix(all[i])] = { balance: "1000000000000000000000000000"};
  }
  template['alloc'][VOTING_CONTRACT_ADDR].balance = "1000000000000000000000000000";
  template['alloc'][GOVERNANCE_CONTRACT_ADDR].balance = "1000000000000000000000000000";
}

/**
 * Parse and return the genesis block config object.
 */
function loadConfig() {
  let fn = path.join(process.cwd(),CONFIG_FILENAME);
  if(!fs.existsSync(fn)) {
    console.log(` > Missing config file '${CONFIG_FILENAME}' in the current directory`);
    process.exit(1);
  }

  let contents = fs.readFileSync(fn);
  let json = JSON.parse(contents);

  if(!json.threshold || json.threshold < 1) {
    console.log(" > Voting threshold missing or less than 1" );
    process.exit(1);
  }

  if(!json.voters || json.voters.length < json.threshold) {
    console.log(" > Voter addresses missing or less than the threshold" );
    process.exit(1);
  }

  if(!json.makers || json.makers.length < 1) {
    console.log(" > Maker addresses missing or less than 1" );
    process.exit(1);
  }

  if (!json.owners || json.owners.length < 1 ) {
    // Default to using all validators as governance owners
    json.owners = json.voters;
  }

  if (!json.fundedObservers) {
    // Default to empty observer array for backwards compatibility
    json.fundedObservers = []
  }

  return json;
}

function main() {
  let config = loadConfig();
  buildVotingStorage(config);
  buildGovernanceStorage(config);
  fundAddresses(config)
  fs.writeFileSync(path.join(process.cwd(),OUTPUT), JSON.stringify(template, null, 2));
}

main();
