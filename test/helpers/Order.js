const { ethers, getChainId, deployments, getNamedAccounts } = require("hardhat");
const { _TypedDataEncoder } = require("@ethersproject/hash");

class Order {
    static ORDER_TYPEHASH = "0xab5a3cde4099dd100c5023ee2e044c7accce20021c8216c30c89bd17bb8e6205";

    constructor(
        maker,
        fromToken,
        toToken,
        amountIn,
        amountOutMin,
        recipient = maker.address,
        deadline,
        fee
    ) {
        this.maker = maker;
        this.fromToken = fromToken;
        this.toToken = toToken;
        this.amountIn = amountIn;
        this.amountOutMin = amountOutMin;
        this.recipient = recipient;
        this.deadline = deadline;
        this.fee = fee;
    }

    async hash(overrides = {}) {
        return ethers.utils.keccak256(
            ethers.utils.defaultAbiCoder.encode(
                [
                    "bytes32",
                    "address",
                    "address",
                    "address",
                    "uint256",
                    "uint256",
                    "address",
                    "uint256",
                    "uint256",
                ],
                [
                    Order.ORDER_TYPEHASH,
                    overrides.maker || this.maker.address,
                    overrides.fromToken || this.fromToken.address,
                    overrides.toToken || this.toToken.address,
                    overrides.amountIn || this.amountIn,
                    overrides.amountOutMin || this.amountOutMin,
                    overrides.recipient || this.recipient,
                    overrides.deadline || this.deadline,
                    overrides.fee || this.fee,
                ]
            )
        );
    }

    async sign(overrides = {}) {
        const { deployer } = await getNamedAccounts();        
        const { address } = await deployments.get("OrderBook", {
            from: deployer,
            log: true,
        });

        const chainId = await getChainId();
        const domain = {
            name: "OrderBook",
            version: "1",
            chainId,
            verifyingContract: address,
        };        

        const types = {
            Order: [
                { name: "maker", type: "address" },
                { name: "fromToken", type: "address" },
                { name: "toToken", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMin", type: "uint256" },
                { name: "recipient", type: "address" },
                { name: "deadline", type: "uint256" },
                { name: "fee", type: "uint256" },
            ],
        };
        const value = {
            maker: overrides.maker || this.maker.address,
            fromToken: overrides.fromToken || this.fromToken.address,
            toToken: overrides.toToken || this.toToken.address,
            amountIn: overrides.amountIn || this.amountIn,
            amountOutMin: overrides.amountOutMin || this.amountOutMin,
            recipient: overrides.recipient || this.recipient,
            deadline: overrides.deadline || this.deadline,
            fee: overrides.fee || this.fee,
        };

        const digest = _TypedDataEncoder.hash(domain, types, value);

        // Deployer private key for default hardhat accounts[0], might want to replace this
        const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
        const key = new ethers.utils.SigningKey(ethers.utils.hexlify(privateKey));
        const signature = key.signDigest(digest);
        return ethers.utils.splitSignature(signature);
    }

    async toArgs(overrides = {}) {
        const { v, r, s } = await this.sign(overrides);
        return [
            overrides.maker || this.maker.address,
            overrides.fromToken || this.fromToken.address,
            overrides.toToken || this.toToken.address,
            overrides.amountIn || this.amountIn,
            overrides.amountOutMin || this.amountOutMin,
            overrides.recipient || this.recipient,
            overrides.deadline || this.deadline,
            overrides.fee || this.fee,
            v,
            r,
            s,
        ];
    }
}

module.exports = Order;
