# Deterministic automated failure: a mock DataChannel never opens, so PeerClient must use relay.
# Real NAT failure and Android DIRECT still require the manual demo.
npm.cmd test -- --testNamePattern "times out a simulated dead DataChannel"
