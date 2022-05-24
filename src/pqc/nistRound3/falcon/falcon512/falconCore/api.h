
#define CRYPTO_SECRETKEYBYTES   1281
#define CRYPTO_PUBLICKEYBYTES   897
#define CRYPTO_BYTES            692
#define CRYPTO_ALGNAME          "Falcon-512"
#define NONCELEN                40
#define SEEDLEN                 48

#ifdef __cplusplus
extern "C" {
#endif

int 
falcon_seed_to_sk(unsigned char *sk, const unsigned char *seed);

int 
falcon_seed_to_pk(unsigned char *pk, const unsigned char *seed);

int 
falcon_genkey(unsigned char *pk, unsigned char *sk, 
	unsigned char *seed);

int 
falcon_genkey_by_seed(unsigned char *pk, unsigned char *sk, 
	unsigned char *seed);

int
falcon_sign(unsigned char *sm, const unsigned char *m, 
	unsigned long long mlen, const unsigned char *sk);

int
falcon_sign_custom_nonce(unsigned char *sm, const unsigned char *m, 
	unsigned long long mlen, const unsigned char *sk);

int
verify_sign(const unsigned char *m, unsigned long long mlen,
	const unsigned char *sm, const unsigned char *pk);

#ifdef __cplusplus
}
#endif
