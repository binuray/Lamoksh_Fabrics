-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'ORDER_CREATED', 'AWB_ASSIGNED', 'PICKUP_SCHEDULED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shiprocket_order_id" VARCHAR(100),
    "shiprocket_shipment_id" VARCHAR(100),
    "awb_code" VARCHAR(100),
    "courier_name" VARCHAR(100),
    "courier_id" INTEGER,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "tracking_url" VARCHAR(500),
    "label_url" VARCHAR(500),
    "manifest_url" VARCHAR(500),
    "pickup_status" VARCHAR(50),
    "pickup_token_number" VARCHAR(100),
    "pickup_scheduled_date" TIMESTAMP(3),
    "last_tracking_update" TIMESTAMP(3),
    "error_message" TEXT,
    "weight" DOUBLE PRECISION DEFAULT 0.5,
    "length" DOUBLE PRECISION DEFAULT 10,
    "breadth" DOUBLE PRECISION DEFAULT 10,
    "height" DOUBLE PRECISION DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_order_id_idx" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_shiprocket_order_id_idx" ON "shipments"("shiprocket_order_id");

-- CreateIndex
CREATE INDEX "shipments_shiprocket_shipment_id_idx" ON "shipments"("shiprocket_shipment_id");

-- CreateIndex
CREATE INDEX "shipments_awb_code_idx" ON "shipments"("awb_code");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
