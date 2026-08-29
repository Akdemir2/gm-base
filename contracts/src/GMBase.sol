// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GMBase {
    mapping(address => uint256) public lastGM;

    event GM(address indexed user, uint256 timestamp);

    function gm() external {
        require(
            block.timestamp >= lastGM[msg.sender] + 1 days,
            "Already GM today"
        );

        lastGM[msg.sender] = block.timestamp;

        emit GM(msg.sender, block.timestamp);
    }

    function canGM(address user) external view returns (bool) {
        return block.timestamp >= lastGM[user] + 1 days;
    }
}
