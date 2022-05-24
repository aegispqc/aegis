#include <openssl/rand.h>

int randombytes(unsigned char *x, unsigned long long xlen){
    return RAND_priv_bytes( x, xlen);
}