// swift-tools-version: 6.0
import PackageDescription
let package = Package(name:"WhisketchCore",platforms:[.macOS(.v14)],products:[.library(name:"WhisketchCore",targets:["WhisketchCore"])],targets:[.target(name:"WhisketchCore",path:"Native/Core"),.testTarget(name:"WhisketchCoreTests",dependencies:["WhisketchCore"],path:"Tests/Swift")],swiftLanguageModes:[.v5])
