const { ethers, getNamedAccounts } = require("hardhat");

async function main() {
    const { deployer, user } = await getNamedAccounts();

    let UniswapV2Factory = await ethers.getContract("UniswapV2Factory");
    let res = await UniswapV2Factory.INIT_CODE_PAIR_HASH();
    console.log(res);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
