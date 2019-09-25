const BN = require('bignumber.js');
require('chai')
  .use(require('chai-as-promised'))
  .use(require('bn-chai')(BN))
  .should();
const moment = require('moment');

const increaseTime = (duration) => {
    const id = Date.now()
    return new Promise((resolve, reject) => {
        web3.currentProvider.send({
            jsonrpc: '2.0',
            method: 'evm_increaseTime',
            params: [duration.asSeconds()],
            id: id,
        }, err1 => {
            if (err1) return reject(err1)
            web3.currentProvider.send({
                jsonrpc: '2.0',
                method: 'evm_mine',
                id: id+1,
            }, (err2, res) => {
                return err2 ? reject(err2) : resolve(res)
            })
        })
    })
}

const Token = artifacts.require('Token');
const Nabu = artifacts.require('Nabu');
const Sportsplex = artifacts.require('Exchange');
const Lockup = artifacts.require('Lockup');


contract('nabu', accounts => {
    let nabu;
    let sportsplex;
    let team;
    let token;
    const desc = '0x46cb93b6d0e029a0d1d5cbf35972696bff8bad04f3855dcef16719427fdce1ef';

    const [
        owner,
        anonymous,
        eoa0,
        eoa1,
        eoa2
    ] = accounts;

    before(async () => {
        nabu = await Nabu.new({from: owner});
        sportsplex = await Sportsplex.at(await nabu.sportsplex());
        team = await Lockup.at(await nabu.team());
        token = await Token.at(await nabu.token());
    });

    it('erc20 specifications', async () => {
        (await token.name()).should.be.equal('SportsplexToken');
        (await token.symbol()).should.be.equal('SPX');
        (await token.decimals()).should.eq.BN(8);
        (await token.totalSupply()).should.eq.BN(BN(10).pow(17));
    });

    it('initial token distribution', async () => {
        const totalSupply = BN(await token.totalSupply());
        const percent = totalSupply.div(100);

        (await token.balanceOf(await nabu.address)).should.be.eq.BN(percent.times(25));
        (await token.balanceOf(await sportsplex.address)).should.be.eq.BN(percent.times(60));
        (await token.balanceOf(await team.address)).should.be.eq.BN(percent.times(15));
    });

    it('transfer ownership', async () => {
        (await nabu.owner()).should.be.equal(owner);
        await nabu.transferOwnership(anonymous, {from:anonymous}).should.be.rejected;
        await nabu.transferOwnership(eoa0, {from:owner}).should.be.fulfilled;
        (await nabu.owner()).should.be.equal(eoa0);

        const r0 = await nabu.transferOwnership(owner, {from: eoa0}).should.be.fulfilled;
        r0.logs[0].event.should.be.equal('TransferOwnership');
        r0.logs[0].args.__length__.should.be.equal(2);
        r0.logs[0].args.previousOwner.should.be.equal(eoa0);
        r0.logs[0].args.newOwner.should.be.equal(owner);
    });

    it('transfer reserve', async () => {
        const m0 = BN(1000);
        const b0 = BN(await token.balanceOf(eoa1));
        const b1 = BN(await token.balanceOf(await nabu.address));

        await nabu.transferReserve(eoa1, m0, desc, {from: anonymous}).should.be.rejected;
        await nabu.transferReserve(eoa1, m0, desc, {from: owner}).should.be.fulfilled;
        (await token.balanceOf(eoa1)).should.eq.BN(b0.plus(m0));
        (await token.balanceOf(await nabu.address)).should.eq.BN(b1.minus(m0));

        const r0 = await nabu.transferReserve(eoa1, m0, desc, {from: owner}).should.be.fulfilled;
        r0.logs[0].event.should.be.equal('TransferReserve');
        r0.logs[0].args.__length__.should.be.equal(3);
        r0.logs[0].args.to.should.be.equal(eoa1);
        r0.logs[0].args.amount.should.eq.BN(m0);
        r0.logs[0].args.desc.should.be.equal(desc);
    });

    it('lockup expiration', async () => {
        const lockupExpiryDate = 1612533600 // Friday February 05, 2021 09:00:00 (am) in time zone America/New York (EST)
        const untilTheDayBefore = Math.floor((lockupExpiryDate - (Date.now() / 1000)) / (24 * 60 * 60));

        const m0 = BN(1000);
        await nabu.transferTeamShare(eoa2, m0, desc, {from: owner}).should.be.rejected;
        await increaseTime(moment.duration(untilTheDayBefore, 'day'));
        await nabu.transferTeamShare(eoa2, m0, desc, {from: owner}).should.be.rejected;
        await increaseTime(moment.duration(1, 'day'));
        await nabu.transferTeamShare(eoa2, m0, desc, {from: owner}).should.be.fulfilled;
        await nabu.transferTeamShare(eoa2, m0, desc, {from: anonymous}).should.be.rejected;

        const b0 = BN(await token.balanceOf(eoa2));
        const b1 = BN(await token.balanceOf(await team.address));
        await nabu.transferTeamShare(eoa2, m0, desc, {from: owner}).should.be.fulfilled;
        (await token.balanceOf(eoa2)).should.eq.BN(b0.plus(m0));
        (await token.balanceOf(await team.address)).should.eq.BN(b1.minus(m0));

        const r0 = await nabu.transferTeamShare(eoa2, m0, desc, {from: owner}).should.be.fulfilled;
        r0.logs[0].event.should.be.equal('TransferTeamShare');
        r0.logs[0].args.__length__.should.be.equal(3);
        r0.logs[0].args.to.should.be.equal(eoa2);
        r0.logs[0].args.amount.should.eq.BN(m0);
        r0.logs[0].args.desc.should.be.equal(desc);
    });
});

contract('sportsplex', accounts => {
    let sportsplex;
    let token;
    const desc = '0x46cb93b6d0e029a0d1d5cbf35972696bff8bad04f3855dcef16719427fdce1ef';

    const [
        owner,
        eoa0,
        eoa1,
        eoa2
    ] = accounts;

    before(async () => {
        const nabu = await Nabu.new({from: owner});
        sportsplex = await Sportsplex.at(await nabu.sportsplex());
        token = await Token.at(await nabu.token());
        await nabu.transferReserve(eoa0, BN(10).pow(15), desc, {from: owner});
    });

    it('withdraw', async () => {
        const b0 = BN(await token.balanceOf(eoa1));
        const b1 = BN(await token.balanceOf(await sportsplex.address));

        const m0 = BN(100);
        await sportsplex.withdraw(eoa2, eoa1, m0, desc).should.be.fulfilled;
        (await token.balanceOf(eoa1)).should.eq.BN(b0.plus(m0));
        (await token.balanceOf(await sportsplex.address)).should.eq.BN(b1.minus(m0));

        const r0 = await sportsplex.withdraw(eoa2, eoa1, m0, desc).should.be.fulfilled;
        r0.logs[0].event.should.be.equal('Withdraw');
        r0.logs[0].args.__length__.should.be.equal(4);
        r0.logs[0].args.from.should.be.equal(eoa2);
        r0.logs[0].args.to.should.be.equal(eoa1);
        r0.logs[0].args.amount.should.eq.BN(m0);
        r0.logs[0].args.desc.should.be.equal(desc);
    });

    it('collect', async () => {
        await token.approve(await sportsplex.address, BN(10).pow(18), {from: eoa2}).should.be.fulfilled;
        await token.transfer(eoa2, BN(10).pow(8), {from: eoa0}).should.be.fulfilled;

        const b0 = BN(await token.balanceOf(eoa2));
        const b1 = BN(await token.balanceOf(await sportsplex.address));
        const b2 = BN(await token.allowance(eoa2, await sportsplex.address));

        const m0 = BN(100);
        await sportsplex.collect(eoa2, m0, desc).should.be.fulfilled;
        (await token.balanceOf(eoa2)).should.eq.BN(b0.minus(m0));
        (await token.balanceOf(await sportsplex.address)).should.eq.BN(b1.plus(m0));
        (await token.allowance(eoa2, await sportsplex.address)).should.eq.BN(b2.minus(m0));

        const r0 = await sportsplex.collect(eoa2, m0, desc).should.be.fulfilled;
        r0.logs[0].event.should.be.equal('Collect');
        r0.logs[0].args.__length__.should.be.equal(3);
        r0.logs[0].args.from.should.be.equal(eoa2);
        r0.logs[0].args.amount.should.eq.BN(m0);
        r0.logs[0].args.desc.should.be.equal(desc);
    });

    it('batch collect', async () => {
        const m0 = BN(100);
        for (let i = 0; i < accounts.length; ++i) {
            await token.approve(await sportsplex.address, BN(10).pow(18), {from: accounts[i]});
            await token.transfer(accounts[i], m0, {from: eoa0});
        }

        await sportsplex.batchCollect(
            accounts,
            Array(accounts.length).fill(m0),
            Array(accounts.length).fill(desc)
        ).should.be.fulfilled;
    });
});
