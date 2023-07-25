// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Client {

    constructor() {}

    struct ClientStruct {
        string name;
        bool exist;
    }

    mapping(address => ClientStruct) public clients;

    function createClient(address clientAddress, ClientStruct memory item) public {
        clients[clientAddress] = item;
    }

    function exist(address _address) public view returns(bool) {
        return clients[_address].exist;
    }
}