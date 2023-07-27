import { assert } from "chai";
import { OrderStatus, OrderVerification } from "./enum";
import { ethers } from "hardhat";

export const parsedOrder = (order: any) => {
  return {
    orderId: order.orderId,
    itemsQuantity: order.itemsQuantity,
    orderStatus: OrderStatus[order.orderStatus],
    orderVerification: OrderVerification[order.orderVerification],
    observations: order.observations,
    price: `${ethers.utils.formatEther(order.price)} ETH`,
    exist: order.exist,
  };
};

export const parsedProducts = (products: any) => {
  return products.map((product: any) => {
    return {
      sku: product.sku,
      quantity: product.quantity,
    };
  });
};

export const shouldFail = async (
  callback: Function,
  error: string = "Something was wrong"
) => {
  const assignment = await callback();
  assignment ? assert(assignment) : assert(assignment, error);
};
