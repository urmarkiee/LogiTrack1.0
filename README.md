##LogiTrack1.0 — Online Logistics Tracking and Management System

LogiTrack is a web-based logistics tracking and management system designed to help customers, couriers, and administrators monitor and manage the delivery of purchased items. It provides a centralized platform for shipment updates, delivery coordination, and visibility into the latest reported package location.

##Purpose
LogiTrack aims to improve delivery transparency, tracking visibility, operational efficiency, and customer satisfaction by making shipment information accessible online.

##Main Users
| User | Responsibilities and Features |
| --- | --- |
| **Customer** | Register and sign in, view assigned purchased items, check delivery status, and see the latest reported package location. |
| **Courier / Delivery Personnel** | View assigned packages, update delivery progress, and share GPS coordinates from a device accompanying the package. Courier access requires administrator approval. |
| **Administrator** | Manage shipment records, approve authorized personnel, assign deliveries, and monitor logistics transactions. |

##How LogiTrack1.0 Works
1. Order and shipment registration: An administrator registers a purchased item and assigns a unique tracking number.
2. Courier assignment: An approved courier is assigned to transport the package.
3. Delivery and location updates: The courier reports shipment status and GPS coordinates to Supabase.
4. Customer tracking: The customer views delivery status and the latest reported location on a map.
5. Delivery completion: The shipment is marked Delivered, and the recorded delivery history remains available.
   
##Main Objective
To develop a secure, accessible, and efficient online logistics tracking system that improves shipment monitoring, delivery management, and communication between customers, couriers, and administrators.

##GPS Tracking Note
The map shows the latest location reported by the courier's device, provided that device is accompanying the package. It does not independently locate a package or imply that the item contains its own GPS tracker. Updates depend on the courier's device permissions and internet connectivity.

Note: GPS tracking reflects the latest location reported by the courier's device, not an independent GPS tracker inside the package.
