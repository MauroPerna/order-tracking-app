export enum OrderStatus {
    PENDING,
    CANCELED,
    IN_PREPARATION,
    PREPARED,
    IN_TRANSIT,
    DELIVERED,
    VERIFIED
}

export enum OrderVerification {
    NOT_VERIFIED,
    ERROR_IN_ORDER,
    PACKAGING_PROBLEMS,
    DAMAGED_PRODUCT
}