import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, assert } from "chai";
import { Contract } from "ethers";
import { ethers, network } from "hardhat";
import { parsedOrder, parsedProducts, shouldFail } from "./utils/auxiliar";
import { OrderStatus, OrderVerification } from "./utils/enum";
import { it } from "mocha";

describe("App", async function () {
  let [owner, alice, bob, charlie, daniel]: SignerWithAddress[] = [];
  let contract: Contract;
  let pendingOrdersQueueContract: Contract;
  let dispatchedOrdersQueueContract: Contract;


  beforeEach(async () => {
    const app = await ethers.getContractFactory("App");
    const queue = await ethers.getContractFactory("Queue");
    const skus = ["01500", "02500", "03150", "04100", "05100"];
    const contrato = await app.deploy(skus);

    contract = await contrato.deployed();
    [owner, alice, bob, charlie, daniel] = await ethers.getSigners();

    const pendingOrdersQueueContractAddress = contract.pendingOrdersQueue();
    const dispatchedOrdersQueueContractAddress = contract.dispatchedOrdersQueue();

    pendingOrdersQueueContract = queue.attach(pendingOrdersQueueContractAddress)
    dispatchedOrdersQueueContract = queue.attach(dispatchedOrdersQueueContractAddress)
  })

  describe("Initialized", async () => {
    it("The App was deployed", async () => {
      expect(contract.address).to.not.equal(ethers.constants.AddressZero);
      expect(pendingOrdersQueueContract.address).to.not.equal(ethers.constants.AddressZero);
      expect(dispatchedOrdersQueueContract.address).to.not.equal(ethers.constants.AddressZero);
    })
  })

  describe("Queue", async () => {
    it("Should enqueue an item to the queue", async () => {
      const testQueue = await ethers.getContractFactory("TestQueue");
      const testQueueContract = await testQueue.deploy();

      const queueSizeBefore = await testQueueContract.getSize();
      await testQueueContract.testEnqueue(ethers.utils.formatBytes32String("random-value"));
      const queueSizeAfter = await testQueueContract.getSize();

      expect(queueSizeAfter).to.be.greaterThan(queueSizeBefore);
    })

    it("Should dequeue an item to the queue", async () => {
      const testQueue = await ethers.getContractFactory("TestQueue");
      const testQueueContract = await testQueue.deploy();

      const queueSizeT1 = await testQueueContract.getSize();
      await testQueueContract.testEnqueue(ethers.utils.formatBytes32String("random-value"));
      const queueSizeT2 = await testQueueContract.getSize();
      await testQueueContract.testDequeue();
      const queueSizeT3 = await testQueueContract.getSize();

      expect(queueSizeT2).to.be.greaterThan(queueSizeT1);
      expect(queueSizeT3).to.be.lessThan(queueSizeT2)
    })
  })

  describe("Order Flow", async () => {
    let orderId: any;
    let appWithOwnerAsSigner: Contract;
    let appWithAliceAsSigner: Contract;
    let appWithBobAsSigner: Contract;
    let appWithCharlieAsSigner: Contract;

    beforeEach(async () => {
      appWithOwnerAsSigner = contract.connect(owner);
      await appWithOwnerAsSigner.createClient(alice.address, "Alice");
      await appWithOwnerAsSigner.createWarehouseWorker(bob.address, "Bob");
      await appWithOwnerAsSigner.createDispatcherWorker(charlie.address, "Charlie");

      appWithAliceAsSigner = contract.connect(alice);
      appWithBobAsSigner = contract.connect(bob);
      appWithCharlieAsSigner = contract.connect(charlie);

      const quantityItemsBySKU = [3, 5, 0, 3, 0];
      const orderCreatedPromise = new Promise(async (resolve, reject) => {
        appWithAliceAsSigner.on("OrderCreated", (client: string, orderId: string) => {
          resolve({ client, orderId });
        });

        const tx = await appWithAliceAsSigner.createOrder(quantityItemsBySKU, { value: ethers.utils.parseEther("1") });
        await tx.wait();
      });

      const order: any = await orderCreatedPromise;
      orderId = order.orderId;
    })

    describe("Create Order", async () => {

      it("As client, should create and order with PENDING status", async () => {
        const orderCreated = await appWithAliceAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderCreated);

        const products = await appWithAliceAsSigner.getProductsByClient(orderId);
        const productsParsed = parsedProducts(products);

        expect(parsed.orderId).to.be.a("string");
        expect(parsed.itemsQuantity).to.be.a("number");
        expect(parsed.orderStatus).to.be.oneOf(Object.values(OrderStatus));
        expect(parsed.orderStatus).to.be.equal("PENDING");
        expect(parsed.observations).to.be.a("string");
        expect(parsed.price).to.be.a("string");
        expect(parsed.exist).to.be.a("boolean");
        productsParsed.map((item: any) => {
          expect(item.sku).to.be.a("string");
          expect(item.quantity).to.be.a("number");
        })

        const exist = await pendingOrdersQueueContract.containsOrderId(orderId);
        expect(exist).to.equal(true);
      })


      it("Should fail if the caller to create the order is not a valid client", async () => {
        shouldFail(async () => {
          try {
            const quantityItemsBySKU = [3, 5, 0, 3, 0];
            const appWithBobAsSigner = contract.connect(bob);
            await appWithBobAsSigner.createOrder(quantityItemsBySKU);
            return false;
          } catch (error) {
            return true
          }
        }, 'The function should not run')
      })


      it("As a customer, should be able to CANCEL an order if its status is PENDING", async () => {
        const orderCreated = await appWithAliceAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderCreated);
        const exist = await pendingOrdersQueueContract.containsOrderId(orderId);
        expect(exist).to.equal(true);
        expect(parsed.orderStatus).to.be.equal("PENDING");

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithAliceAsSigner.cancelOrder(orderId);
        const orderCanceled = await appWithAliceAsSigner.getOrder(orderId);
        const parsedOrderCanceled = parsedOrder(orderCanceled);
        expect(parsedOrderCanceled.orderStatus).to.be.equal("CANCELED");
      })

      it("As a warehouser, should ignore CANCELED orders", async () => {
        await appWithAliceAsSigner.cancelOrder(orderId);

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        expect(appWithBobAsSigner.addOrderToPreparationStage()).to.be.revertedWith("No valid order found in client queue");
      })
    })

    describe("Order In Preparation", async () => {
      it("As warehouse worker, should can add order in preparation stage and mark an order as IN_PREPARATION", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();
        const existInPendingOrderQueue = await pendingOrdersQueueContract.containsOrderId(orderId);
        expect(existInPendingOrderQueue).to.equal(false);
        const orderAfterChanges = await appWithBobAsSigner.getOrder(orderId)
        const orderAfterChangesParsed = parsedOrder(orderAfterChanges);
        expect(orderAfterChangesParsed.orderStatus).to.be.equal("IN_PREPARATION");
        const orderIdFromQueue = await appWithBobAsSigner.warehouserToOrderId(bob.address);
        expect(orderIdFromQueue).to.not.equal(ethers.constants.HashZero)
      })
    })

    describe("Order In Deliver Stage", async () => {
      it("As warehouse worker, should can add order in deliver stage and mark an order as PREPARED", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithBobAsSigner.moveOrderToDeliverStage();
        const orderT2 = await appWithCharlieAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderT2);
        expect(parsed.orderStatus).to.be.equal("PREPARED");
        const existInDispatchedOrderQueue = await dispatchedOrdersQueueContract.containsOrderId(orderT2.orderId);
        expect(existInDispatchedOrderQueue).to.equal(true);
      })

      it("As dispatcher worker, should can dispatch an order and mark an order as IN_TRANSIT", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();

        await network.provider.send("evm_increaseTime", [300]);
        await network.provider.send("evm_mine");

        await appWithBobAsSigner.moveOrderToDeliverStage();

        const orderPickedT1 = await appWithCharlieAsSigner.dispatcherToOrderId(charlie.address)
        expect(orderPickedT1).to.be.equal(ethers.constants.HashZero)
        await appWithCharlieAsSigner.dispatchOrder();
        const orderPickedT2 = await appWithCharlieAsSigner.dispatcherToOrderId(charlie.address)
        expect(orderPickedT2).to.be.not.equal(ethers.constants.HashZero)
        const orderPicked = await appWithCharlieAsSigner.getOrder(orderPickedT2);
        const parsed = parsedOrder(orderPicked);
        expect(parsed.orderStatus).to.be.equal("IN_TRANSIT");
      })

      it("As dispatcher worker, should can deliver an order and mark  an order as DELIVERED", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithBobAsSigner.moveOrderToDeliverStage();

        await appWithCharlieAsSigner.dispatchOrder();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        const orderDeliverPromise = new Promise(async (resolve, reject) => {
          contract.on("OrderDeliver", (orderId: string) => {
            resolve({ orderId });
          });

          const tx = await appWithCharlieAsSigner.deliverOrder();
          await tx.wait();
        });

        const { orderId }: any = await orderDeliverPromise;
        expect(orderId).to.be.not.equal(ethers.constants.HashZero)
        const orderCreated = await appWithAliceAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderCreated);
        expect(parsed.orderStatus).to.be.equal("DELIVERED");
      })
    })

    describe("Order In Verification Stage", async () => {
      it("As a client, should be able to mark an order as VERIFIED", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithBobAsSigner.moveOrderToDeliverStage();

        await appWithCharlieAsSigner.dispatchOrder();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithCharlieAsSigner.deliverOrder();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        const balanceOwnerT1 = await owner.getBalance();
        const tx = await appWithAliceAsSigner.verifyOrder(orderId)
        tx.wait();
        const balanceOwnerT2 = await owner.getBalance();

        const orderVerificated = await appWithAliceAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderVerificated);
        expect(parsed.orderStatus).to.be.equal("VERIFIED");
        expect(balanceOwnerT2).to.be.greaterThan(balanceOwnerT1)
      })

      it("As a client, should be able to mark an order as received with discrepancy", async () => {
        await appWithBobAsSigner.addOrderToPreparationStage();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithBobAsSigner.moveOrderToDeliverStage();

        await appWithCharlieAsSigner.dispatchOrder();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        await appWithCharlieAsSigner.deliverOrder();

        await network.provider.send("evm_increaseTime", [100]);
        await network.provider.send("evm_mine");

        const tx = await appWithAliceAsSigner.markOrderAsReceivedWithDiscrepancy(orderId, OrderVerification.ERROR_IN_ORDER)
        tx.wait();

        const orderVerificated = await appWithAliceAsSigner.getOrder(orderId);
        const parsed = parsedOrder(orderVerificated);
        expect(parsed.orderStatus).to.be.equal("DELIVERED");
        expect(parsed.orderVerification).to.be.equal("ERROR_IN_ORDER");
      })
    })
  })
});

