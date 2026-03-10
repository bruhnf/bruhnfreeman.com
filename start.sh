 #!/bin/bash
 
 # Start MongoDB in the background
 mongod --dbpath /data/db --bind_ip_all --fork --logpath /var/log/mongod.log
 
 # Wait for MongoDB to be ready
 echo "Waiting for MongoDB to start..."
 until mongosh --eval "print('MongoDB is ready')" > /dev/null 2>&1; do
     sleep 1
 done
 
 echo "MongoDB started successfully"
 
 # Update MONGO_URI to use localhost since MongoDB is now in the same container
 export MONGO_URI=mongodb://localhost:27017/phonetester
 
 # Start the Node.js application
 echo "Starting Node.js application..."
 exec npm start