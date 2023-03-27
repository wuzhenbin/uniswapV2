
hh compile

hello world

hh deploy 
hh deploy --network localhost
hh deploy --network sepolia
hh deploy --network goerli

hh deploy --tags mocks
hh deploy --tags signature

hh node
hh run scripts/main.js --network localhost
hh run scripts/main.js --network goerli
hh run scripts/withdraw.js --network localhost

hh test
hh test --network localhost
hh test --grep store 
hh test --grep "Only allows the owner to withdraw" 
hh test --network sepolia
hh coverage

hh test test/unit/Pair.test.js --grep "testBurn"
hh test test/unit/Factory.test.js
hh test test/unit/Library.test.js --grep "Library Last Tests"
hh test test/unit/Router.test.js --grep "Pair Last Unit Tests"
hh test test/unit/Flash.test.js






