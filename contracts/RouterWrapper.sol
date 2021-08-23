// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

interface IUniswapRouterETH {
    function swapExactTokensForTokens(
        uint amountIn, 
        uint amountOutMin, 
        address[] calldata path, 
        address to, 
        uint deadline
    ) external returns (uint[] memory amounts);

    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        payable
        returns (uint[] memory amounts);
    
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        returns (uint[] memory amounts);
}

contract RouterWrapper is Ownable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    uint256 public feePercent;
    address payable public feeAddress;
    uint256 public PRECISION = 1e18;
    uint256 public MAX_FEE_PERCENT = 3 * PRECISION; // 3%

    constructor(uint256 _feePercent, address payable _feeAddress) public {
        feePercent = _feePercent;
        feeAddress = _feeAddress;
    }

    fallback() external payable {}

    receive() external payable {}

    function setFeePercent(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= MAX_FEE_PERCENT, ">maximum limit");
        feePercent = _feePercent;
    }

    function setFeeAddress(address payable _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "invalid address");
        require(_feeAddress != feeAddress, "same address");
        feeAddress = _feeAddress;
    }

    function swapExactTokensForTokens(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).approve(router, amountIn);
        amounts = IUniswapRouterETH(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            deadline
        );
        uint256 amountOut = amounts[amounts.length - 1];        
        uint256 feeAmount = amountOut.mul(feePercent).div(100*PRECISION);
        IERC20(path[path.length - 1]).safeTransfer(to, amountOut.sub(feeAmount));
        IERC20(path[path.length - 1]).safeTransfer(feeAddress, feeAmount);

        amounts[amounts.length - 1] = amountOut.sub(feeAmount);
    }

    function swapExactETHForTokens(
        address router,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        amounts = IUniswapRouterETH(router).swapExactETHForTokens{
            value: msg.value
        }(amountOutMin, path, address(this), deadline);
        uint256 amountOut = amounts[amounts.length - 1];
        uint256 feeAmount = amountOut.mul(feePercent).div(100*PRECISION);
        IERC20(path[path.length - 1]).safeTransfer(to, amountOut.sub(feeAmount));
        IERC20(path[path.length - 1]).safeTransfer(feeAddress, feeAmount);        

        amounts[amounts.length - 1] = amountOut.sub(feeAmount);
    }

    function swapExactTokensForETH(
        address router,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address payable to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        IERC20(path[0]).approve(router, amountIn);
        amounts = IUniswapRouterETH(router).swapExactTokensForETH(
            amountIn,
            amountOutMin,
            path,
            address(this),
            deadline
        );
        uint256 amountOut = amounts[amounts.length - 1];
        uint256 feeAmount = amountOut.mul(feePercent).div(100*PRECISION);
        to.transfer(amountOut.sub(feeAmount));
        feeAddress.transfer(feeAmount);

        amounts[amounts.length - 1] = amountOut.sub(feeAmount);
    }
}
