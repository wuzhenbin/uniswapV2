const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    if (developmentChains.includes(network.name)) {
        const Factory = await ethers.getContract("uniswapV2Factory");
        const Library = await ethers.getContract("uniswapV2Library");

        await deploy("uniswapV2Router", {
            from: deployer,
            log: true,
            libraries: {
                uniswapV2Library: Library.address,
            },
            args: [Factory.address],
        });
    }
};
module.exports.tags = ["router"];
