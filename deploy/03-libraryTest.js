const { network, ethers } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();

    if (developmentChains.includes(network.name)) {
        const Library = await ethers.getContract("uniswapV2Library");
        await deploy("LibTest", {
            from: deployer,
            libraries: {
                uniswapV2Library: Library.address,
            },
            log: true,
            args: [],
        });
    }
};
module.exports.tags = ["libraryTest"];
