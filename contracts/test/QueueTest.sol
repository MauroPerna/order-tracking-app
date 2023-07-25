// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../utils/Queue.sol";

contract TestQueue is Queue {
    function testEnqueue(bytes32 _orderId) public {
        enqueue(_orderId);
    }

    function testDequeue() public returns (bytes32 orderId) {
        return dequeue();
    }
}
