const { assert, expect } = require("chai");
const { network, ethers } = require("hardhat");
const { developmentChains } = require("../../helper-hardhat-config");

// eth => BigNumber
const eth2big = (eth) => ethers.utils.parseEther(eth.toString());
// wei => BigNumber
const wei2big = (wei) => ethers.BigNumber.from(wei.toString());
// BigNumber => eth
const big2eth = (bigNumber) => ethers.utils.formatEther(bigNumber);

if (!developmentChains.includes(network.name)) {
    describe.skip;
} else {
    describe("Flash Unit Tests", function () {
        let PairAB, FlashLoaner, TokenA, TokenB, owner, user;

        beforeEach(async () => {
            [owner, user] = await ethers.getSigners();

            await deployments.fixture(["flash"]);

            const Token = await ethers.getContractFactory("UniswapV2ERC20");
            const Pair = await ethers.getContractFactory("uniswapV2Pair");

            FlashLoaner = await ethers.getContract("Flashloaner");

            TokenA = await Token.deploy("TokenA", "AAA");
            TokenB = await Token.deploy("TokenB", "BBB");
            await TokenA.deployed();
            await TokenB.deployed();

            // mint 10 eth
            TokenA.mint(eth2big(10));
            TokenB.mint(eth2big(10));
            TokenA.connect(user).mint(eth2big(10));
            TokenB.connect(user).mint(eth2big(10));

            PairAB = await Pair.deploy();
            await PairAB.deployed();
            await PairAB.initialize(TokenA.address, TokenB.address);
        });

        it("testFlashloan", async () => {
            await TokenA.transfer(PairAB.address, eth2big(1));
            await TokenB.transfer(PairAB.address, eth2big(2));
            await PairAB.mint(owner.address);

            /* 
            The thing is, Uniswap V2 imposes fees on flash loans:
            we must pay the swap fee on them. 
            Recall that we didn’t implement any additional checks for whether a flash loan was repaid or not–
            we simply used the new k calculation. 
            And this calculation subtracts the swap fee from balances! 
            So, when returning a flash loan we must pay the amount we’ve taken + 0.3% 
            (slightly above that actually: 0.3009027%).

            For Flashloaner to repay full amount, 
            we calculate flashloanFee and send it to the contract.
            After the flash loan is repaid, 
            Flashloaner’s balance is 0 and the pair contract gets the fee.
            */
            const flashloanAmount = eth2big(0.1);
            // flashloanAmount * 0.003
            // flashloanAmount * 3 / 1000
            // 实际上比3/1000还多一点 所以缩小分母
            // flashloanAmount * 3 / 997

            // 0.0003
            // const flashloanFee = flashloanAmount.mul(3).div(1000);
            // 0.000300902708124373
            const flashloanFee = flashloanAmount
                .mul(1000)
                .div(997)
                .sub(flashloanAmount)
                .add(1);

            // 把手续费打到借方合约里面 否则不够还钱
            await TokenB.transfer(FlashLoaner.address, flashloanFee);

            await FlashLoaner.flashloan(
                PairAB.address,
                0,
                flashloanAmount,
                TokenB.address
            );

            expect(
                (await TokenB.balanceOf(FlashLoaner.address)).toString()
            ).to.equal("0");

            expect(await TokenB.balanceOf(PairAB.address)).to.equal(
                eth2big(2).add(flashloanFee)
            );
        });
    });
}
