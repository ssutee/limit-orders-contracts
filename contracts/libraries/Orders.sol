// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;

library Orders {
    // keccak256("Order(address maker,address fromToken,address toToken,uint256 amountIn,uint256 amountOutMin,address recipient,uint256 deadline,uint256 fee)")
    bytes32 public constant ORDER_TYPEHASH = 0xab5a3cde4099dd100c5023ee2e044c7accce20021c8216c30c89bd17bb8e6205;

    struct Order {
        address maker;
        address fromToken;
        address toToken;
        uint256 amountIn;
        uint256 amountOutMin;
        address recipient;
        uint256 deadline;
        uint256 fee;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.maker,
                    order.fromToken,
                    order.toToken,
                    order.amountIn,
                    order.amountOutMin,
                    order.recipient,
                    order.deadline, 
                    order.fee
                )
            );
    }

    function validate(Order memory order) internal pure {
        require(order.maker != address(0), "invalid-maker");
        require(order.fromToken != address(0), "invalid-from-token");
        require(order.toToken != address(0), "invalid-to-token");
        require(order.fromToken != order.toToken, "duplicate-tokens");
        require(order.amountIn > 0, "invalid-amount-in");
        require(order.amountOutMin > 0, "invalid-amount-out-min");
        require(order.recipient != address(0), "invalid-recipient");
        require(order.deadline > 0, "invalid-deadline");
    }
}
