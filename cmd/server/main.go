package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"clara-mundi/internal/host"
)

func main() {
	clusterFile := flag.String("cluster", "data/cluster.json", "cluster configuration (proxy + maps)")
	configFile := flag.String("config", "", "legacy single-map server.json (optional)")
	jwtSecret := flag.String("jwt-secret", "", "JWT signing secret (required in production)")
	flag.Parse()

	path := *clusterFile
	if _, err := os.Stat(path); err != nil && *configFile != "" {
		log.Fatalf("cluster config %s not found (legacy -config is unused in cluster mode)", path)
	}

	rt, err := host.Start(host.Options{
		ClusterFile: path,
		JWTSecret:   *jwtSecret,
	})
	if err != nil {
		log.Fatal(err)
	}
	defer rt.Close()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	log.Printf("shutting down…")
}
