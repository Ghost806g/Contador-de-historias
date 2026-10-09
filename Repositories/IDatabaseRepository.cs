using System.Collections.Generic;
using System.Threading.Tasks;
using Contador_de_Historias.Models;

namespace Contador_de_Historias.Repositories;

public interface IDatabaseRepository
{
    Task<IEnumerable<SessaoHistoria>> GetSessoesAsync();
    Task<SessaoHistoria> CriarSessaoAsync(string nomePersonagem, string cenarioContexto);
    Task<string> GetContextoSessaoAsync(int idSessao);
    Task<IEnumerable<MensagemChat>> GetHistoricoSessaoAsync(int idSessao);
    Task<int> DeletarMensagensAposAsync(int idSessao, int idMensagem);
    Task SalvarMensagemAsync(int idSessao, string papel, string conteudo);
    Task DeletarSessaoAsync(int idSessao);
}
