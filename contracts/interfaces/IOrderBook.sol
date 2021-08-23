// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;


import "../libraries/Orders.sol";
pragma experimental ABIEncoderV2;

interface IOrderBook {
    function orderOfHash(bytes32) external returns (Orders.Order memory);
}