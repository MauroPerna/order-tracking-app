import { DeployFunction } from "hardhat-deploy/types"
import { getNamedAccounts, deployments, network } from "hardhat"

const deployFunction: DeployFunction = async () => {
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [["01500", "02500", "03150", "04100", "05100"]]
    await deploy(`App`, { from: deployer, log: true, args })
}

export default deployFunction