module.exports = {
  mocha: {
      reporter: 'eth-gas-reporter',
      reporterOptions : {
          currency: 'KRW',
          gasPrice: 12,
          showTimeSpent: true
      },
      enableTimeouts: false
  },
  solc: {
      optimizer: {
          enabled: true,
          runs: 1000000
      }
  }
}