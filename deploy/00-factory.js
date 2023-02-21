const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    if (developmentChains.includes(network.name)) {
        await deploy("uniswapV2Factory", {
            from: deployer,
            log: true,
            args: [],
        });
    }
};
module.exports.tags = ["factory"];
