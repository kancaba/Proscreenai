import {describe,it,expect} from 'vitest'
import {publicAddress} from '../../electron/imageReferencePage'
describe('image reference network boundary',()=>{
 it('rejects loopback, private, link local and mapped addresses',()=>{for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.2','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','::1','fe80::1','fc00::1','::ffff:127.0.0.1'])expect(publicAddress(ip),ip).toBe(false)})
 it('accepts public IPv4 and global IPv6',()=>{expect(publicAddress('1.1.1.1')).toBe(true);expect(publicAddress('2606:4700:4700::1111')).toBe(true)})
})
