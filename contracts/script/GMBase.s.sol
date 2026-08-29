// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Script} from "forge-std/Script.sol";
import {GMBase} from "../src/GMBase.sol";

contract GMBaseScript is Script {
    GMBase public gmBase;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        gmBase = new GMBase();

        vm.stopBroadcast();
    }
}
