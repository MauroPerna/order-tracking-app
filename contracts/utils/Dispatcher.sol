// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Dispatcher {

    constructor() {}

    struct Worker {
        string name;
        bool exist;
    }

    mapping(address => Worker) public dispatcherWorkers;

    function createDispatcherWorker(address _worker, Worker memory item) public {
        dispatcherWorkers[_worker] = item;
    }

    function exist(address _address) public view returns(bool) {
        return dispatcherWorkers[_address].exist;
    }
}