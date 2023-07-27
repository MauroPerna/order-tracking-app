import { ethers } from "hardhat";

async function main() {
  // Obtener la cuenta predeterminada para realizar el despliegue
  const [deployer] = await ethers.getSigners();

  console.log("Desplegando contrato con la cuenta:", deployer.address);

  // Compilar el contrato
  const Contract = await ethers.getContractFactory("App");
  const contract = await Contract.deploy();

  console.log("Contrato desplegado en la dirección:", contract.address);
}

// Ejecutar la función de despliegue
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
