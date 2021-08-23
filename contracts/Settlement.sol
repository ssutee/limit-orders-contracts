// SPDX-License-Identifier: MIT

pragma solidity =0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/SafeMath.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/TransferHelper.sol";
import "@sushiswap/core/contracts/uniswapv2/libraries/UniswapV2Library.sol";
import "@sushiswap/core/contracts/uniswapv2/interfaces/IERC20.sol";
import "./interfaces/ISettlement.sol";
import "./interfaces/IOrderBook.sol";
import "./interfaces/IRouterWrapper.sol";
import "./libraries/Orders.sol";
import "./libraries/EIP712.sol";

contract Settlement is ISettlement, ReentrancyGuard, Ownable {
    using SafeMathUniswap for uint256;
    using Orders for Orders.Order;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 public immutable DOMAIN_SEPARATOR;

    // Hash of an order => if canceled
    mapping(address => mapping(bytes32 => bool)) public canceledOfHash;
    // Hash of an order => filledAmountIn
    mapping(bytes32 => uint256) public filledAmountInOfHash;

    address public immutable factory;
    
    address public orderBookAddress;

    IRouterWrapper public router;

    constructor(
        uint256 orderBookChainId,
        address _orderBookAddress,
        address _factory,
        address _router
    ) public {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("OrderBook"),
                keccak256("1"),
                orderBookChainId,
                _orderBookAddress
            )
        );
        factory = _factory;
        orderBookAddress = _orderBookAddress;        
        router = IRouterWrapper(_router);
    }

    fallback() external payable {}

    receive() external payable {}

    // Fills an order
    function fillOrder(FillOrderArgs memory args) 
        public override nonReentrant returns (uint256 amountOut) {
        // voids flashloan attack vectors
        // solhint-disable-next-line avoid-tx-origin
        require(msg.sender == tx.origin, "called-by-contract");

        // Check if the order is canceled / already fully filled
        bytes32 hash = args.order.hash();
        _validateStatus(args, hash);

        // Check if the signature is valid
        address signer = EIP712.recover(DOMAIN_SEPARATOR, hash, args.order.v, args.order.r, args.order.s);
        require(signer != address(0) && signer == args.order.maker, "invalid-signature");

        // Calculates amountOutMin
        uint256 amountOutMin = (args.order.amountOutMin.mul(args.amountToFillIn) / args.order.amountIn);

        // Calculates fee amount
        uint256 feeAmount = args.order.fee;
        if (args.amountToFillIn < args.order.amountIn) {
            feeAmount = (args.order.fee.mul(args.amountToFillIn) / args.order.amountIn);
        }

        IERC20Uniswap(args.order.fromToken).transferFrom(
            args.order.maker, 
            address(this), 
            args.amountToFillIn
        );

        IERC20Uniswap(args.order.fromToken).approve(
            address(router), 
            args.amountToFillIn
        );

        uint256[] memory amounts = router.swapExactTokensForTokens(            
            args.router, 
            args.amountToFillIn, 
            amountOutMin, 
            args.path, 
            args.order.recipient, 
            now.add(60)
        );
        amountOut = amounts[amounts.length - 1];


        // This line is free from reentrancy issues since UniswapV2Pair prevents from them
        filledAmountInOfHash[hash] = filledAmountInOfHash[hash].add(args.amountToFillIn);

        if (feeAmount > 0) {
            msg.sender.transfer(feeAmount);
            emit FeeTransferred(hash, msg.sender, feeAmount);
        }
        

        emit OrderFilled(hash, args.amountToFillIn, amountOut);
    }

    // Checks if an order is canceled / already fully filled
    function _validateStatus(FillOrderArgs memory args, bytes32 hash) internal view {
        require(args.order.deadline >= block.timestamp, "order-expired");
        require(!canceledOfHash[args.order.maker][hash], "order-canceled");
        require(filledAmountInOfHash[hash].add(args.amountToFillIn) <= args.order.amountIn, "already-filled");
    }

    // Cancels an order, has to been called by order maker
    function cancelOrder(bytes32 hash) public override {
        require(!canceledOfHash[msg.sender][hash], "already-cancelled");
        
        canceledOfHash[msg.sender][hash] = true;

        Orders.Order memory order = IOrderBook(orderBookAddress).orderOfHash(hash);
        
        // refund fee
        if (order.fee > 0) {
            uint256 feeAmountDiscount = (order.fee.mul(filledAmountInOfHash[hash]) / order.amountIn);
            uint256 feeAmount = order.fee.sub(feeAmountDiscount);
            msg.sender.transfer(feeAmount);
            emit FeeTransferred(hash, msg.sender, feeAmount);
        }

        emit OrderCanceled(hash);
    }

    function setRouter(address _router) external onlyOwner {
        require(_router != address(0),"invalid-address");
        require(_router != address(router), "same-value");
        router = IRouterWrapper(_router);
    }
}
