// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Queue is Ownable {
    using SafeMath for uint256;

    mapping(uint256 => bytes32) private queue;
    uint256 private frontIndex;
    uint256 private rearIndex;
    uint256 private size;

    constructor() {
        frontIndex = 0;
        rearIndex = 0;
        size = 0;
    }

    function enqueue(bytes32 _orderId) public onlyOwner {
        queue[rearIndex] = _orderId;
        rearIndex = (rearIndex.add(1)).mod(type(uint256).max);
        size = size.add(1);
    }

    function dequeue() public onlyOwner returns (bytes32 orderId) {
        require(size > 0, "Queue is empty");
        bytes32 item = queue[frontIndex];
        delete queue[frontIndex];
        frontIndex = (frontIndex.add(1)).mod(type(uint256).max);
        size = size.sub(1);
        return item;
    }

    function getSize() public view onlyOwner returns (uint256) {
        return size;
    }

    function containsOrderId(bytes32 _orderId) public view returns (bool) {
        for (uint256 i = 0; i < size; i++) {
            uint256 index = (frontIndex.add(i)).mod(type(uint256).max);
            if (queue[index] == _orderId) {
                return true;
            }
        }
        return false;
    }
}
