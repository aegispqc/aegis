import Ajv from "ajv"

const ajv = new Ajv();

const version = {
	type: 'integer',
	minimum: 0,
	maximum: 0xff_ff_ff_ff
};

const hash = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$',
	maxLength: 64,
	minLength: 64,
}

const hexString = {
	type: 'string',
	pattern: '^([a-f0-9]{2})+$',
}

const uint32 = {
	type: 'integer',
	minimum: 0,
	maximum: 0xffffffff	// 4 byte ( uint 32 )
}

const uint16 = {
	type: 'integer',
	minimum: 0,
	maximum: 0xffff	// 2 byte ( uint 116 )
}

const uintString = {
	type: 'string',
	pattern: '^([0-9])+$',
}

const booleanType = {
	type: 'boolean'
}

export { version, hash, hexString, uint32, uint16, uintString, booleanType };