const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    if (developmentChains.includes(network.name)) {
        let lib = await deploy("uniswapV2Library", {
            from: deployer,
            log: true,
            args: [],
        });
    }
};
module.exports.tags = ["library"];
