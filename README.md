# Bedocord

En fazla 10 arkadaş için özel Windows sohbet uygulaması. Yazı kanalları, ses odaları, ekran paylaşımı, tema ve profil ayarları içerir. Katılımcılardan biri ayrıldığında koordinasyon açık olan diğer bilgisayarlardan birine aktarılır. Her cihaz mesajları kendi veritabanına kaydeder; başka cihaza kaydedilen mesajlar arayüzde ayrıca işaretlenir.

## Kurulum

1. Windows 10/11 (x64) bilgisayarlarda [Radmin VPN'in resmî sürümünü](https://www.radmin-vpn.com/) kurun. Bir arkadaş özel ağ kursun, diğerleri aynı ağa katılsın. Bu işlem Bedocord tarafından otomatik yapılmaz.
2. Bedocord paketini açıp `Bedocord.exe` dosyasını çalıştırın. Windows güvenlik duvarı izin isterse yalnızca bu uygulamanın **özel ağ** bağlantısına izin verin. Güvenlik duvarını kapatmayın. Radmin'in uzaktan kontrol ürünü olan Radmin Server gerekmez.
3. İlk kişi **Grup kur** bölümünde takma adını, grup adını ve `26.x.x.x` Radmin adresini seçer. Uygulama açıkken **Arkadaş davet et** düğmesiyle kod üretir.
4. Diğer kişiler kendi Radmin adreslerini seçip **Davete katıl** bölümüne kodu yapıştırır. Her kod bir kez ve 15 dakika içinde kullanılabilir. Yeni üye kabul edilirken yöneticinin uygulaması açık olmalıdır; daha sonra yöneticinin çevrimdışı olması sohbeti durdurmaz.
5. Ses odasına tıklayarak mikrofonu başlatın. Ekran paylaşmak için ses odasındaki ekran simgesine basıp ekran/pencere seçin. Arkadaşınız aynı ses odasına katıldığında yayın penceresi onun ekranında otomatik açılır; ayrıca bir izleme düğmesi yoktur. Yakalama yalnızca bu açık eylemlerle başlar.

Yayın açıldığında sağ altta kendi görüntünüzün küçük ve sessiz bir ön izlemesi görünür. Ön izlemeyi gizleyip ses odasındaki **Ön izleme** düğmesiyle geri açabilirsiniz; gizlemek yayını durdurmaz. Mesaj, odaya giriş/çıkış, mikrofon ve yayın işlemlerinin kısa sesleri **Ayarlar → Ses ayarları → İşlem sesleri** ile kapatılabilir. Kendi mesajınızda **Bu cihazda** yazması mesajın yerel olarak kaydedildiği anlamına gelir; başka bilgisayar mesajı aldığında **Başka cihaza yedeklendi** görünür. Tek kişilik grupta yedek göstergesi beklenmez.

## Ana ekran ve yanlış kurulan grup

Sol üstteki Bedocord simgesine basarak ana ekrana dönebilirsiniz. Buradan **Grubu bu cihazdan kaldır** seçeneği, onayınızdan sonra bu cihazdaki grup kimliğini ve mesaj geçmişini silip yeni grup kurma ekranını açar. Aynı işlem **Ayarlar → Grup** bölümünde de vardır. Yanlış kurulan gruba henüz kimse katılmadıysa grup böylece kaldırılmış olur. Başka üyeler katıldıysa onların cihazlarındaki grup ve mesajlar kalır. Uygulama açıldığında **Yeniden bağlan** ekranında takılı kalırsanız oradaki **Kayıtlı grubu bu cihazdan kaldır** düğmesini kullanın.

## Yönetici kurtarma

Grubu kuran kişi **Ayarlar → Yönetici kurtarma dosyası** bölümünde güçlü bir parola belirleyip şifreli dosya indirebilir. Dosyayı ve parolayı güvenli ve ayrı yerlerde saklayın. Başka Windows bilgisayarda **Kurtar** bölümüne dosyanın içeriğini ve parolayı girip kendi Radmin adresinizi seçin. **Kurtarmayı tamamlamak için mevcut üyelerden en az birinin çevrimiçi olması gerekir.** Uygulama önce güncel üyeliği eşitler, ardından yeni bir yönetici cihaz kimliği oluşturur. Yedek alındıktan sonra eklenen üyeler, yalnızca o an çevrimiçi kişinin cihazında eski üyelik kayıtları varsa bulunabilir; eksik kalan üyeleri yeniden davet edin. Aynı yönetici kimliği birden fazla bilgisayarda eşzamanlı çalıştırılmamalıdır.

## Ağ ve veri

Uygulama yalnızca seçilen özel IPv4 adresinde 45871 numaralı bağlantı noktasını dinler. Yönetici yeni üye kaydederken 45872 numaralı noktayı da dinler. İnternet üzerinden açık port veya modem yönlendirmesi istenmez. Radmin VPN uzak bilgisayarları aynı özel ağa bağlar; bağlantı kalitesi internetinize ve Radmin yönlendirmesine bağlıdır. Uygulama herkesin bilgisayarı kapalıyken hizmet vermez. Mesajlar yalnızca bir bilgisayardaysa ve o cihaz kapalıysa, diğerleri o mesajı göremez. Bir yayıncı ayrıldığında onun ekran yayını biter.

Mesaj geçmişi her cihazdaki Windows kullanıcı verisinde tutulur. Kimlik dosyası Windows güvenli depolamasıyla korunur. Yönetici şifreli kurtarma dosyasını ayrıca dışa aktarabilir. Davet kodu grup sertifikasını ve tek kullanımlık kayıt yetkisini içerir; sadece güvendiğiniz arkadaşlarla paylaşın. Çıkarılan üye daha önce kendi bilgisayarına almış olduğu mesajları elinde tutabilir.

## Geliştirici kurulumu

Node.js 22 ve npm gereklidir. `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm start` komutlarını proje klasöründe çalıştırın. `npm run package`, Windows klasör paketini `release/Bedocord` altında oluşturur. Başka cihazlarda denemeden önce ses ve ekran paylaşımı bağlantısını iki farklı internet üzerinden test edin. Yalnızca yerel ağ testleri, uzak internet üzerinden medya desteğini kanıtlamaz.

## Geçerli sınırlar

- Windows 10/11 x64 sürümüdür; telefon istemcisi yoktur.
- Aynı bağlı grupta bir ekran yayını hedeflenir. Yayıncı dokuz izleyici için yeterli yükleme hızına sahip olmalıdır. Yayın penceresindeki kalite seçimi 720p veya 480p sınırını ayarlar; uygulama bağlantı yetersizliğini henüz otomatik ölçüp yayını duraklatmaz.
- Radmin VPN ayrı bir bağımlılıktır. Kurulumu ve özel ağa katılma her arkadaşın kendi bilgisayarında yapılır.
- Yönetici kalıcı olarak anahtarını kaybeder ve kurtarma dosyası yoksa yeni üye eklenemez; mevcut üyeler sohbet etmeyi sürdürebilir.
- Çok bilgisayarlı ses/ekran testi teslim ortamında yapılmadı; bunu gerçek arkadaş cihazlarında doğrulamak gerekir.
