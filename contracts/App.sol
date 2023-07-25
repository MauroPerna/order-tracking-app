// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./utils/Queue.sol";
import "./utils/Dispatcher.sol";
import "./utils/Warehouse.sol";
import "./utils/Client.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract App is Ownable {
    Queue public pendingOrdersQueue;
    Queue public dispatchedOrdersQueue;
    Warehouse private warehouse;
    Dispatcher private dispatcher;
    Client private client;
    string[] private skus;

    event OrderCreated(address client, bytes32 orderId);
    event OrderDeliver(bytes32 orderId);
    event LogMessage(string message);

    mapping(address => mapping(bytes32 => Order)) public clientToOrders;
    mapping(bytes32 => address) orderIdToClientAddress;
    mapping(bytes32 => Product[]) orderToProducts;
    mapping(address => bytes32) public warehouserToOrderId;
    mapping(address => bytes32) public dispatcherToOrderId;

    enum OrderStatus {
        PENDING,
        CANCELED,
        IN_PREPARATION,
        PREPARED,
        IN_TRANSIT,
        DELIVERED,
        VERIFIED
    }

    enum OrderVerification {
        NOT_VERIFIED,
        ERROR_IN_ORDER,
        PACKAGING_PROBLEMS,
        DAMAGED_PRODUCT
    }

    struct Product {
        string sku;
        uint8 quantity;
    }

    struct Order {
        bytes32 orderId;
        uint8 itemsQuantity;
        OrderStatus orderStatus;
        OrderVerification orderVerification;
        string observations;
        uint256 price;
        bool exist;
    }

    constructor(string[] memory _skus) {
        pendingOrdersQueue = new Queue();
        dispatchedOrdersQueue = new Queue();
        warehouse = new Warehouse();
        dispatcher = new Dispatcher();
        client = new Client();
        skus = _skus;
    }

    // ================================== MODIFIERS ==================================

    // Modifier to restrict access to only valid clients
    modifier onlyClient() {
        require(client.exist(msg.sender), "You aren't a valid client");
        _;
    }

    // Modifier to restrict access to only valid warehouse workers
    modifier onlyWarehouseWorker() {
        require(
            warehouse.exist(msg.sender),
            "You aren't a valid warehouse worker"
        );
        _;
    }

    // Modifier to restrict access to only valid dispatcher workers
    modifier onlyDispatcherWorker() {
        require(
            dispatcher.exist(msg.sender),
            "You aren't a valid dispatcher worker"
        );
        _;
    }

    // ================================== PUBLIC FUNCTIONS ==================================

    /**
     *  @dev Function to create a new warehouse worker
     *  @param _worker is the address of the worker
     *  @param _name of the worker
     */

    function createWarehouseWorker(
        address _worker,
        string memory _name
    ) public onlyOwner {
        Warehouse.Worker memory newWarehouseWorker = Warehouse.Worker({
            name: _name,
            exist: true
        });

        warehouse.createWarehouseWorker(_worker, newWarehouseWorker);
    }

    /**
     *  @dev Function to create a new dispatcher worker
     *  @param _worker is the address of the worker
     *  @param _name of the worker
     */
    function createDispatcherWorker(
        address _worker,
        string memory _name
    ) public onlyOwner {
        Dispatcher.Worker memory newDispatcherWorker = Dispatcher.Worker({
            name: _name,
            exist: true
        });

        dispatcher.createDispatcherWorker(_worker, newDispatcherWorker);
    }

    /**
     * @dev Function to create a new client
     * @param _clientAddress is the address of the client
     * @param _name of the client
     */
    function createClient(address _clientAddress, string memory _name) public {
        Client.ClientStruct memory newClient = Client.ClientStruct({
            name: _name,
            exist: true
        });

        client.createClient(_clientAddress, newClient);
    }

    /**
     * @dev Function to get an Order
     * @param orderId order's id
     */
    function getOrder(bytes32 orderId) public view returns (Order memory) {
        return _getOrder(orderId);
    }

    // Client
    /**
     * @dev Function to create an Order
     * @param quantities array with quantities of each product
     */
    function createOrder(uint8[] memory quantities) public payable onlyClient {
        uint8 quantityItems;
        bytes32 orderId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp)
        );

        clientToOrders[msg.sender][orderId] = Order({
            orderId: orderId,
            itemsQuantity: 0,
            orderStatus: OrderStatus.PENDING,
            orderVerification: OrderVerification.NOT_VERIFIED,
            observations: "",
            price: msg.value,
            exist: true
        });

        for (uint8 i = 0; i < 5; i++) {
            string memory sku = skus[i];
            uint8 quantity = quantities[i];
            _addProduct(orderId, sku, quantity);
            quantityItems += quantity;
        }

        clientToOrders[msg.sender][orderId].itemsQuantity = quantityItems;

        pendingOrdersQueue.enqueue(orderId);
        orderIdToClientAddress[orderId] = msg.sender;
        emit OrderCreated(msg.sender, orderId);
    }

    /**
     * @dev Function to cancel an Order
     * @param orderId order's id
     */
    function cancelOrder(bytes32 orderId) public onlyClient {
        require(
            clientToOrders[msg.sender][orderId].exist,
            "The order doesn't exist"
        );
        require(
            clientToOrders[msg.sender][orderId].orderStatus ==
                OrderStatus.PENDING,
            "The order cann't be canceled"
        );

        clientToOrders[msg.sender][orderId].orderStatus = OrderStatus.CANCELED;
    }

    /**
     * @dev Function to get products from an order
     * @param orderId order's id
     */
    function getProductsByClient(
        bytes32 orderId
    ) public view onlyClient returns (Product[5] memory products) {
        return _getProducts(orderId, msg.sender);
    }

    /**
     * @dev Function to confirm that an order has been received
     * @param orderId order's id
     */
    function verifyOrder(bytes32 orderId) public onlyClient {
        Order storage order = _getOrder(orderId);
        order.orderStatus = OrderStatus.VERIFIED;
        address payable ownerAddress = payable(owner());
        ownerAddress.transfer(order.price);
    }

    /**
     * @dev Function to notify the status in which an order was received
     * @param orderId order's id
     * @param reason reason for discrepancy
     */
    function markOrderAsReceivedWithDiscrepancy(
        bytes32 orderId,
        OrderVerification reason
    ) public onlyClient {
        require(
            clientToOrders[msg.sender][orderId].exist,
            "The order doesn't exist"
        );
        require(
            clientToOrders[msg.sender][orderId].orderStatus ==
                OrderStatus.DELIVERED,
            "The order must be in DELIVERED status to be marked as received with discrepancy"
        );
        require(
            reason >= OrderVerification.NOT_VERIFIED &&
                reason <= OrderVerification.DAMAGED_PRODUCT,
            "Invalid reason. Please provide a valid input."
        );

        Order storage order = _getOrder(orderId);
        order.orderVerification = reason;
    }

    // Warehouse Worker

    /**
     * @dev Function to add an order in preparation stage
     */
    function addOrderToPreparationStage() public onlyWarehouseWorker {
        bool orderFound = false;
        bytes32 orderId;

        while (pendingOrdersQueue.getSize() > 0 && !orderFound) {
            orderId = pendingOrdersQueue.dequeue();
            if (
                clientToOrders[msg.sender][orderId].orderStatus !=
                OrderStatus.CANCELED
            ) {
                orderFound = true;
            }
        }

        if (orderFound) {
            Order storage order = _getOrder(orderId);
            order.orderStatus = OrderStatus.IN_PREPARATION;
            warehouserToOrderId[msg.sender] = orderId;
        } else {
            revert("No valid order found in client queue");
        }
    }

    /**
     * @dev Function to move an order to deliver stagea
     */
    function moveOrderToDeliverStage() public onlyWarehouseWorker {
        require(
            warehouserToOrderId[msg.sender] != bytes32(0),
            "You don't have an assigned order"
        );
        bytes32 orderId = warehouserToOrderId[msg.sender];
        delete warehouserToOrderId[msg.sender];
        Order storage order = _getOrder(orderId);
        order.orderStatus = OrderStatus.PREPARED;
        dispatchedOrdersQueue.enqueue(orderId);
    }

    /**
     * @dev Function to take an order and dispatch it
     */
    function dispatchOrder() public onlyDispatcherWorker {
        bytes32 orderId = dispatchedOrdersQueue.dequeue();
        Order storage order = _getOrder(orderId);
        order.orderStatus = OrderStatus.IN_TRANSIT;
        dispatcherToOrderId[msg.sender] = orderId;
    }

    /**
     * @dev Function to mark an order as delivered
     */
    function deliverOrder() public onlyDispatcherWorker {
        require(
            dispatcherToOrderId[msg.sender] != bytes32(0),
            "You don't have an assigned order"
        );
        bytes32 orderId = dispatcherToOrderId[msg.sender];
        delete dispatcherToOrderId[msg.sender];
        Order storage order = _getOrder(orderId);
        order.orderStatus = OrderStatus.DELIVERED;
        emit OrderDeliver(orderId);
    }

    // ========================================== PRIVATE METHODS ==========================================

    /**
     * @dev Private function to get an instance of the order in the contract.
     * @param _orderId order's id
     */
    function _getOrder(bytes32 _orderId) private view returns (Order storage) {
        require(
            orderIdToClientAddress[_orderId] != address(0),
            "The owner doesn't exist"
        );
        address _ownerOfOrder = orderIdToClientAddress[_orderId];
        require(
            clientToOrders[_ownerOfOrder][_orderId].exist,
            "The order doesn't exist"
        );
        return clientToOrders[_ownerOfOrder][_orderId];
    }

    /**
     * @dev Private function to add products to an order
     * @param _orderId order's id
     * @param sku off-chain identifier of the product
     * @param quantity of product
     */
    function _addProduct(
        bytes32 _orderId,
        string memory sku,
        uint8 quantity
    ) private {
        Product memory newProduct = Product({sku: sku, quantity: quantity});
        orderToProducts[_orderId].push(newProduct);
    }

    /**
     * @dev Private function to get products from an order
     * @param _orderId order's id
     * @param _account address of the client who owns the order
     */
    function _getProducts(
        bytes32 _orderId,
        address _account
    ) private view returns (Product[5] memory products) {
        require(
            clientToOrders[_account][_orderId].exist,
            "The order doesn't exist"
        );
        Product[5] memory productsReturned;

        for (uint8 i = 0; i < 5; ) {
            string memory sku = orderToProducts[_orderId][i].sku;
            uint8 quantity = orderToProducts[_orderId][i].quantity;

            productsReturned[i] = Product({sku: sku, quantity: quantity});

            unchecked {
                ++i;
            }
        }

        return productsReturned;
    }
}
