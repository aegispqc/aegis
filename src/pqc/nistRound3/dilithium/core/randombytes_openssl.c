#include <openssl/rand.h>

int randombytes(uint8_t *x, size_t xlen){
    return RAND_priv_bytes( x, xlen);
}