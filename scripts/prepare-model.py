from pathlib import Path
import shutil
nlat=32
root=Path(__file__).resolve().parents[1]
b=root/'.build'/'low';b.mkdir(parents=True,exist_ok=True)
for p in (root/'model/src').iterdir():
 if p.is_file():shutil.copy2(p,b/p.name)
(b/'resmod.f90').write_text(f'module resmod\ninteger, parameter :: NLAT_ATM={nlat}, NLEV_ATM=10, NPRO_ATM=1\nend module resmod\n')
p=b/'plasim.f90';s=p.read_text()
s=s.replace('program plasim_main','subroutine browser_init() bind(c)',1)
s=s.replace('      call master\n      call epilog\n      call mpstop\n\n      stop\n      end','      call browser_prepare\n      end subroutine browser_init',1)
start=s.index('      subroutine master\n'); loop=s.index('      do while (mocd > 0 .or. nscd > 0)  ! main loop',start)
loop_end=s.index('      enddo ! month countdown',loop)
end=s.index('\n      end',loop_end+len('      enddo ! month countdown'))+len('\n      end')
prepare=s[start:loop].replace('subroutine master','subroutine browser_prepare',1)
body=s[loop+len('      do while (mocd > 0 .or. nscd > 0)  ! main loop'):loop_end]
# The caller controls the number of steps. Retain original physics and output order.
body=body[:body.index('         if (nscd  > 0) then')]
s=s[:start]+prepare+'      end subroutine browser_prepare\n\n      subroutine browser_step() bind(c)\n      use pumamod\n'+body+'      end subroutine browser_step\n'+s[end:]
# Upstream calini has eight arguments; both call sites omitted MPSTEP.
s=s.replace(',solar_day,-1,mcal_days_per_year)',',solar_day,-1,mpstep,mcal_days_per_year)')
s=s.replace(',solar_day,0,mcal_days_per_year)',',solar_day,0,mpstep,mcal_days_per_year)')
p.write_text(s)
p=b/'calmod.f90';s=p.read_text().replace('      integer kcal_days_per_year','      real :: kmpstep\n      integer kcal_days_per_year');p.write_text(s)
p=b/'mpimod_stub.f90';s=p.read_text().replace('subroutine mrdiff(p,d,n)','subroutine mrdiff(p,d,n,m)');p.write_text(s)
p=b/'cpl_stub.f90';s=p.read_text().replace('subroutine clsgini(kdatim,ktspd,kaomod,pslm,kxa,kya)','subroutine clsgini(kdatim,ktspd,kaomod,klsg,kgui,pslm,kxa,kya)').replace('psst,ptaux,ptauy,pfresh,pice','psst,ptaux,ptauy,pfresh,proff,pice');p.write_text(s)
p=b/'hurricanemod.f90';s=p.read_text().replace('      subroutine hurricaneini(gascon)\n      use hurricanemod','      subroutine hurricaneini(gascon)\n      use hurricanemod\n      use pumamod, only: mypid, NROOT, nwritehurricane');p.write_text(s)
(b/'browser_api.f90').write_text('''subroutine browser_fields(out) bind(c)
use iso_c_binding
use pumamod
real(c_float), intent(out) :: out(7*NHOR+2*NLAT+4)
integer :: i
out(1:NHOR)=dtsa
out(NHOR+1:2*NHOR)=dcc(:,NLEP)
out(2*NHOR+1:3*NHOR)=du(:,NLEV)
out(3*NHOR+1:4*NHOR)=dv(:,NLEV)
out(4*NHOR+1:5*NHOR)=dp
out(5*NHOR+1:6*NHOR)=dls
out(6*NHOR+1:7*NHOR)=dt(:,NLEP)
out(7*NHOR+1:7*NHOR+NLAT)=real(sid,c_float)
out(7*NHOR+NLAT+1:7*NHOR+2*NLAT)=real(gwd,c_float)
out(7*NHOR+2*NLAT+1)=real(nhcstp-1,c_float)
out(7*NHOR+2*NLAT+2)=deltsec
out(7*NHOR+2*NLAT+3)=real(nshutdown,c_float)
out(7*NHOR+2*NLAT+4)=real(ntspd,c_float)
end subroutine browser_fields

subroutine browser_flush() bind(c)
use pumamod
flush(nud)
end subroutine browser_flush

function browser_nlat() result(n) bind(c)
use iso_c_binding
use pumamod, only: NLAT
integer(c_int) :: n
n=NLAT
end function browser_nlat
''')
# Resource reporting uses Fortran integer(kind=8), whereas C long is 32-bit in Wasm.
(b/'pumax_stub.c').write_text('''#include <stdint.h>
int nresources_(double *ut,double *st,int64_t *mem,int64_t *par,int64_t *paf,int64_t *swa,int64_t *dr,int64_t *dw){*ut=*st=0;*mem=*par=*paf=*swa=*dr=*dw=0;return 1;}
void pumax_dummy(void){}
''')
# Use upstream's dependency graph, with the supplied serial and GUI-free implementations.
prefix='''MPIMOD=mpimod_stub
GUIMOD=guimod_stub
UTILMOD=utilities_stub
PUMAX=pumax_stub
OCEANCOUP=cpl_stub
FFTMOD=fftmod
MOST_F90_OPTS=-O2
MOST_CC_OPTS=-O2
'''
make=(b/'make_plasim').read_text().replace('OCEANCOUP=cpl\n','OCEANCOUP=cpl_stub\n')
make=make.replace('plasim.x:\t$(OBJ)','plasim.x:\t$(OBJ) browser_api.o').replace('$(MOST_F90) -o plasim.x $(MOST_F90_OPTS) $(OBJ)','$(MOST_LINK) $(OBJ) browser_api.o')
make+='\nbrowser_api.o: browser_api.f90 plasimmod.o\nglaciermod.o: landmod.o\naerocore.o: aeromod.o\n'
(b/'Makefile').write_text(prefix+make)
print('Prepared original model and browser entrypoints')
