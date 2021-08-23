const { ethers, deployments } = require("hardhat");
const { WETH, DAI } = require("./tokens");
const helpers = require("./helpers");

describe.only("OrderBook", async () => {
    beforeEach(async () => {
        await deployments.fixture();
    });

    it("Should createOrder()", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();
        const orderBook = await helpers.getContract("OrderBook");
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const { order } = await createOrder(
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100),
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            }
        );
        const hash = await order.hash();
        await helpers.expectToDeepEqual(await order.toArgs(), orderBook.orderOfHash(hash));
        await helpers.expectToEqual(1, orderBook.numberOfAllHashes());
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfMaker(users[0].address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfFromToken(fromToken.address));
        await helpers.expectToEqual(1, orderBook.numberOfHashesOfToToken(toToken.address));

        await helpers.expectToDeepEqual([hash], orderBook.allHashes(0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfMaker(users[0].address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfFromToken(fromToken.address, 0, 1));
        await helpers.expectToDeepEqual([hash], orderBook.hashesOfToToken(toToken.address, 0, 1));

        const balance = await ethers.provider.getBalance(await orderBook.settlementAddress());
        await helpers.expectToEqual(balance, ethers.utils.parseEther("0.01"));
    });

    it("Should revert createOrder() if fee is not matched", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-fee-amount",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.001"),
                {
                    maker: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if fee is not enough", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();
        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "not-enough-fee",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    maker: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.001"),
                }
            )
        );
    });

    it("Should revert createOrder() if maker isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-maker",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    maker: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-from-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    fromToken: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if toToken isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-to-token",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    toToken: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if fromToken == toToken valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "duplicate-tokens",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    toToken: fromToken.address,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if amountIn isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-amount-in",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.Zero,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if amountOutMin isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-amount-out-min",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.Zero,
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if recipient isn't valid", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-recipient",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    recipient: ethers.constants.AddressZero,
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if deadline isn't valid", async () => {
        const { chainId, users, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-deadline",
            createOrder(
                users[0],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                0,
                ethers.utils.parseEther("0.01"),
                {
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if not signed by maker", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        await helpers.expectToBeReverted(
            "invalid-signature",
            createOrder(
                users[1],
                fromToken,
                toToken,
                ethers.constants.WeiPerEther,
                ethers.constants.WeiPerEther.mul(100),
                getDeadline(24),
                ethers.utils.parseEther("0.01"),
                {
                    value: ethers.utils.parseEther("0.01"),
                }
            )
        );
    });

    it("Should revert createOrder() if duplicated", async () => {
        const { chainId, users, getDeadline, createOrder } = await helpers.setup();

        const fromToken = WETH[chainId];
        const toToken = DAI[chainId];

        const args = [
            users[0],
            fromToken,
            toToken,
            ethers.constants.WeiPerEther,
            ethers.constants.WeiPerEther.mul(100),
            getDeadline(24),
            ethers.utils.parseEther("0.01"),
            {
                value: ethers.utils.parseEther("0.01"),
            },
        ];
        await createOrder(...args);
        await helpers.expectToBeReverted("order-exists", createOrder(...args));
    });
});
