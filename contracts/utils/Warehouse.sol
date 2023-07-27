// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Warehouse {
    constructor() {}

    struct Worker {
        string name;
        bool exist;
    }

    mapping(address => Worker) public warehouseStaff;

    function createWarehouseWorker(address _worker, Worker memory item) public {
        warehouseStaff[_worker] = item;
    }

    function exist(address _address) public view returns (bool) {
        return warehouseStaff[_address].exist;
    }
}
