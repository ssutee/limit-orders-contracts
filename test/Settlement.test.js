const { ethers, deployments } = require("hardhat");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe.only("Settlement", function () {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should fillOrder()", async () => {
        const {
            chainId,
            users,
            getTrade,
            swap,
            addLiquidity,
            getDeadline,
            createOrder,
            fillOrder,
            filledAmountIn,
        } = await helpers.setup();

        const router = await helpers.getContract("UniswapV2Router02");
        const settlement = await helpers.getContract("Settlement");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        // Set ratio of WETH:DAI to 1:100
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        // Create an order of amountOutMin to be 1% higher than the current price of 0.01 WETH
        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );

        // Calling fillOrder() reverts because the price is higher than the order
        await helpers.expectToBeReverted(
            "INSUFFICIENT_OUTPUT_AMOUNT",
            fillOrder(users[1], order, trade, router.address)
        );

        // Swap 10 DAI with WETH manually to increase the price of DAI
        await swap(users[0], await getTrade(toToken, fromToken, ethers.constants.WeiPerEther.mul(10)));

        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address);
        await helpers.expectToEqual(ethers.constants.Zero, fromERC20.balanceOf(users[1].address));

        // Calling fillOrder() now works because DAI price increased more than 1%
        const amountIn = ethers.constants.WeiPerEther.div(100);
        const tx2 = await fillOrder(users[1], order, await getTrade(fromToken, toToken, amountIn), router.address);

        const receipt2 = await tx2.wait();
        let event = receipt2.logs[receipt2.logs.length - 1];
        const filled = settlement.interface.decodeEventLog("OrderFilled", event.data, event.topics);
        await helpers.expectToEqual(filled.hash, order.hash());
        await helpers.expectToEqual(filled.amountIn, amountIn);
        await helpers.expectToEqual(amountIn, filledAmountIn(users[1], order));

        event = receipt2.logs[receipt2.logs.length - 2];
        const feeTransferred = settlement.interface.decodeEventLog("FeeTransferred", event.data, event.topics);
        await helpers.expectToEqual(feeTransferred.hash, order.hash());
        await helpers.expectToEqual(feeTransferred.recipient, users[1].address);
        await helpers.expectToEqual(feeTransferred.amount, ethers.utils.parseEther("0.01").div(100));
    });

    it("Should revert fillOrder() if called by a contract", async () => {
        const { chainId, users, getDeadline, createOrder, addLiquidity, getTrade } = await helpers.setup();

        const router = await helpers.getContract("UniswapV2Router02");
        const caller = await helpers.getContract("SettlementCaller");

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const trade = await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100));
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString()).mul(101);
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            amountOutMin,
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );

        await helpers.expectToBeReverted(
            "called-by-contract",
            caller.fillOrder([
                await order.toArgs(),
                trade.inputAmount.raw.toString(),
                trade.route.path.map(token => token.address),
                router.address,
            ])
        );
    });

    it("Should revert fillOrder() if already filled", async () => {
        const { chainId, users, getDeadline, createOrder, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const router = await helpers.getContract("UniswapV2Router02");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );
        await fillOrder(users[1], order, trade, router.address);
        await helpers.expectToBeReverted("already-filled", fillOrder(users[1], order, trade, router.address));
    });

    it("Should revert fillOrder() if called with insufficient allowance", async () => {
        const { chainId, users, getDeadline, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const router = await helpers.getContract("UniswapV2Router02");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );

        await helpers.expectToBeReverted("", fillOrder(users[1], order, trade, router.address));
    });

    it("Should revert fillOrder() if called with a invalid signature", async () => {
        const { chainId, users, getDeadline, addLiquidity, fillOrder, getTrade } = await helpers.setup();
        const router = await helpers.getContract("UniswapV2Router02");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );

        const amountIn = ethers.constants.WeiPerEther.div(100);
        const trade = await getTrade(fromToken, toToken, amountIn);
        const amountOutMin = ethers.BigNumber.from(trade.outputAmount.raw.toString());
        const order = new helpers.Order(
            users[0],
            fromToken,
            toToken,
            amountIn,
            amountOutMin,
            users[0].address,
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );

        const settlement = await helpers.getContract("Settlement", users[1]);
        const fromERC20 = await ethers.getContractAt("IUniswapV2ERC20", fromToken.address, users[1]);
        await fromERC20.approve(settlement.address, amountIn);

        await helpers.expectToBeReverted(
            "invalid-signature",
            fillOrder(users[2], order, trade, router.address, { maker: users[1].address })
        );
    });

    it("Should cancelOrder()", async () => {
        const {
            chainId,
            users,
            addLiquidity,
            getDeadline,
            createOrder,
            cancelOrder,
            fillOrder,
            getTrade,
        } = await helpers.setup();
        const router = await helpers.getContract("UniswapV2Router02");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(101),
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );
        const tx = await cancelOrder(users[0], order);
        const settlement = await helpers.getContract("Settlement");
        const filter = settlement.filters.OrderCanceled(await order.hash());
        const events = await settlement.queryFilter(filter);
        helpers.chai.expect(events.length).to.be.equal(1);

        const receipt = await tx.wait();
        const event = receipt.logs[receipt.logs.length - 2];
        const feeTransferred = settlement.interface.decodeEventLog("FeeTransferred", event.data, event.topics);
        await helpers.expectToEqual(feeTransferred.hash, order.hash());
        await helpers.expectToEqual(feeTransferred.recipient, users[0].address);
        await helpers.expectToEqual(feeTransferred.amount, ethers.utils.parseEther("0.01"));

        // Filling a canceled order does nothing
        await addLiquidity(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther.mul(1),
            ethers.constants.WeiPerEther.mul(100)
        );
        await helpers.expectToBeReverted(
            "order-canceled",
            fillOrder(
              users[1], order, 
              await getTrade(fromToken, toToken, ethers.constants.WeiPerEther.div(100)),
              router.address
            )
        );
    });
});
