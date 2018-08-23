#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
var uniq = require('lodash.uniq');
const utils = require('ethereumjs-util');
let template = require('./template.json');

const CONFIG_FILENAME = 'sampleConfig.json';
const OUTPUT = 'quorum-genesis.json';

const VOTING_CONTRACT_ADDR = '0x0000000000000000000000000000000000000020';
const GOVERNANCE_CONTRACT_ADDR = '0x0000000000000000000000000000000000000042';

function padIndex(number, prefix) {
  if(prefix) {
    return utils.addHexPrefix(utils.setLengthLeft([number], 32, false).toString('hex'));
  }
  return utils.setLengthLeft([number], 32, false).toString('hex');
}

function padAddress(address) {
  return "000000000000000000000000" + utils.stripHexPrefix(address);
}

function storageKey(index, address) {
  let paddedAddress = padAddress(address);
  let paddedIndex = padIndex(index);
  let result = utils.sha3(new Buffer(paddedAddress+paddedIndex, 'hex')).toString('hex');
  return utils.addHexPrefix(result)
}

function mapAddresses(index, addresses, storageAddress) {
  let value = utils.intToHex(1);
  for(let i=0; i<addresses.length; i++) {
    let key = storageKey(index, addresses[i]);
    template['alloc'][storageAddress].storage[key] = value;
  }
}

function buildVotingStorage(input) {
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(1,true)] = utils.intToHex(input.threshold);
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(2,true)] = utils.intToHex(input.blockVoters.length);
  mapAddresses(3, input.blockVoters, VOTING_CONTRACT_ADDR);
  template['alloc'][VOTING_CONTRACT_ADDR].storage[padIndex(4,true)] = utils.intToHex(input.blockMakers.length);
  mapAddresses(5,input.blockMakers, VOTING_CONTRACT_ADDR);
}

function buildGovernanceStorage(input){
  mapAddresses(0, input.governanceOwners, GOVERNANCE_CONTRACT_ADDR);
  template['alloc'][GOVERNANCE_CONTRACT_ADDR].storage[padIndex(1,true)] = utils.intToHex(input.governanceOwners.length);
}

function fundAddresses(input) {
  let all = uniq(input.blockMakers
    .concat(input.blockVoters)
    .concat(input.governanceOwners));
  for(let i=0; i<all.length; i++) {
    template['alloc'][utils.addHexPrefix(all[i])] = { balance: "1000000000000000000000000000"};
  }
  template['alloc'][VOTING_CONTRACT_ADDR].balance = "1000000000000000000000000000";
  template['alloc'][GOVERNANCE_CONTRACT_ADDR].balance = "1000000000000000000000000000";
}

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

  if(!json.blockVoters || json.blockVoters.length < json.threshold) {
    console.log(" > Voter addresses missing or less than the threshold" );
    process.exit(1);
  }

  if(!json.blockMakers || json.blockMakers.length < 1) {
    console.log(" > BlockMaker addresses missing or less than 1" );
    process.exit(1);
  }

  if (!json.governanceOwners || json.governanceOwners.length <1 ) {
    console.log(" > GovernanceOwner addresses missing or less than 1");
    process.exit(1);
  }

  return json;
}

function main() {
  let input = loadConfig();
  buildVotingStorage(input);
  buildGovernanceStorage(input);
  fundAddresses(input)
  fs.writeFileSync(path.join(process.cwd(),OUTPUT), JSON.stringify(template, null, 2));
}

main();
